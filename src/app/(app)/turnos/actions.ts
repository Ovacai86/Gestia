"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { TurnoEstado } from "@/types/turno";
import type { DisponibilidadConFranjas } from "@/types/disponibilidad";
import {
  caeEnDisponibilidad,
  esFechaValida,
  fechaHoraEnAR,
  inicioDelDiaISO,
  sumarDias,
} from "@/lib/agenda";

// Un turno de la serie que pisa a uno que ya estaba. Se crea igual: el
// profesional decide después qué hacer con cada caso.
export type Colision = {
  fecha: string;
  hora: string;
  con: string;
};

export type ResumenRecurrencia = {
  creados: number;
  desde: string;
  hasta: string;
  colisiones: Colision[];
  // Fechas de la serie que caen fuera de la disponibilidad configurada. Se
  // crean igual (es la agenda propia del profesional), pero se avisan.
  fueraDeHorario: string[];
};

export type TurnoFormState = {
  error: string | null;
  resumen?: ResumenRecurrencia | null;
};

// Tope de seguridad: una fecha de fin muy lejana no debería generar miles de
// filas de un click.
const MAX_TURNOS_RECURRENTES = 200;

// El input datetime-local no lleva timezone; se fija -03:00 (AR) para que no
// dependa de en qué timezone corra el servidor (Vercel usa UTC).
function readTurnoForm(formData: FormData) {
  const fechaHoraLocal = String(formData.get("fecha_hora") ?? "");
  const monto = Number(formData.get("monto") ?? 0);
  const duracion = Number(formData.get("duracion_minutos") ?? 50);
  const estado = String(formData.get("estado") ?? "programado") as TurnoEstado;
  const motivoCancelacion = String(formData.get("motivo_cancelacion") ?? "").trim();

  return {
    paciente_id: String(formData.get("paciente_id") ?? ""),
    fecha_hora: fechaHoraLocal ? new Date(`${fechaHoraLocal}:00-03:00`).toISOString() : null,
    duracion_minutos: Number.isFinite(duracion) && duracion > 0 ? duracion : 50,
    estado,
    monto: Number.isFinite(monto) ? monto : 0,
    pagado: formData.get("pagado") === "on",
    motivo_cancelacion: estado === "cancelado" && motivoCancelacion ? motivoCancelacion : null,
  };
}

// Las fechas de la serie: la inicial y después una por semana, hasta la fecha
// de fin inclusive.
function fechasSemanales(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  for (let f = desde; f <= hasta && fechas.length < MAX_TURNOS_RECURRENTES; f = sumarDias(f, 7)) {
    fechas.push(f);
  }
  return fechas;
}

type TurnoExistente = {
  fecha_hora: string;
  duracion_minutos: number;
  paciente: { nombre_apellido: string } | null;
};

export async function crearTurno(
  _prevState: TurnoFormState,
  formData: FormData,
): Promise<TurnoFormState> {
  const data = readTurnoForm(formData);

  if (!data.paciente_id) {
    return { error: "Elegí un paciente." };
  }
  if (!data.fecha_hora) {
    return { error: "La fecha y hora son obligatorias." };
  }
  // El monto lo pone el paciente y el campo es de solo lectura: si llega en
  // cero es porque ese paciente todavía no tiene monto por sesión.
  if (!(data.monto > 0)) {
    return {
      error:
        "Este paciente no tiene monto por sesión configurado. Cargalo desde su ficha antes de agendar un turno.",
    };
  }

  const supabase = await createClient();

  const recurrente = formData.get("recurrente") === "on";
  if (!recurrente) {
    const { error } = await supabase.from("turno").insert(data);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/turnos");
    redirect("/turnos");
  }

  // "YYYY-MM-DDTHH:MM" tal como lo mandó el form, para repetir el mismo
  // horario cada semana sin depender de la timezone del server.
  const fechaHoraLocal = String(formData.get("fecha_hora") ?? "");
  const fechaInicial = fechaHoraLocal.slice(0, 10);
  const horaInicial = fechaHoraLocal.slice(11, 16);
  const fechaFin = String(formData.get("fecha_fin_recurrencia") ?? "").trim();

  if (!esFechaValida(fechaFin)) {
    return { error: "Poné hasta qué fecha se repite el turno." };
  }
  if (fechaFin < fechaInicial) {
    return { error: "La fecha de fin tiene que ser igual o posterior a la del turno." };
  }

  const fechas = fechasSemanales(fechaInicial, fechaFin);
  if (fechas.length >= MAX_TURNOS_RECURRENTES) {
    return {
      error: `La recurrencia genera más de ${MAX_TURNOS_RECURRENTES} turnos. Acortá la fecha de fin.`,
    };
  }

  const filas = fechas.map((fecha) => ({
    ...data,
    fecha_hora: new Date(`${fecha}T${horaInicial}:00-03:00`).toISOString(),
  }));

  const ultima = fechas[fechas.length - 1];

  // Se buscan de una sola vez los turnos que ya existen en todo el rango, y
  // las colisiones se resuelven en memoria. Los cancelados no ocupan horario,
  // así que no cuentan como choque.
  const [{ data: existentes }, { data: disponibilidades }] = await Promise.all([
    supabase
      .from("turno")
      .select("fecha_hora, duracion_minutos, paciente(nombre_apellido)")
      .neq("estado", "cancelado")
      .gte("fecha_hora", inicioDelDiaISO(fechaInicial))
      .lt("fecha_hora", inicioDelDiaISO(sumarDias(ultima, 1)))
      .returns<TurnoExistente[]>(),
    supabase
      .from("disponibilidad")
      .select("*, franja_horaria(*)")
      .returns<DisponibilidadConFranjas[]>(),
  ]);

  const colisiones: Colision[] = [];
  const fueraDeHorario: string[] = [];

  filas.forEach((fila, i) => {
    const fecha = fechas[i];

    // Dos turnos chocan si sus intervalos se solapan, no solo si arrancan a la
    // misma hora.
    const inicio = new Date(fila.fecha_hora).getTime();
    const fin = inicio + fila.duracion_minutos * 60_000;
    const choque = (existentes ?? []).find((t) => {
      const otroInicio = new Date(t.fecha_hora).getTime();
      const otroFin = otroInicio + t.duracion_minutos * 60_000;
      return otroInicio < fin && inicio < otroFin;
    });

    if (choque) {
      colisiones.push({
        fecha,
        hora: fechaHoraEnAR(choque.fecha_hora).hora,
        con: choque.paciente?.nombre_apellido ?? "otro turno",
      });
    }

    if (!caeEnDisponibilidad(fecha, horaInicial, disponibilidades ?? [])) {
      fueraDeHorario.push(fecha);
    }
  });

  const { error } = await supabase.from("turno").insert(filas);

  if (error) {
    return { error: error.message };
  }

  // Con algo para avisar no se redirige: el resumen se muestra en el form.
  // Acá no se revalida /turnos a propósito: al quedarse en el formulario, el
  // refresh del router deja la pestaña trabada un rato largo. El calendario es
  // una ruta dinámica, así que se vuelve a pedir al servidor cuando se navega.
  if (colisiones.length > 0 || fueraDeHorario.length > 0) {
    return {
      error: null,
      resumen: {
        creados: filas.length,
        desde: fechaInicial,
        hasta: ultima,
        colisiones,
        fueraDeHorario,
      },
    };
  }

  revalidatePath("/turnos");
  redirect("/turnos");
}

export async function actualizarTurno(
  id: string,
  _prevState: TurnoFormState,
  formData: FormData,
): Promise<TurnoFormState> {
  const data = readTurnoForm(formData);

  if (!data.paciente_id) {
    return { error: "Elegí un paciente." };
  }
  if (!data.fecha_hora) {
    return { error: "La fecha y hora son obligatorias." };
  }
  // El monto lo pone el paciente y el campo es de solo lectura: si llega en
  // cero es porque ese paciente todavía no tiene monto por sesión.
  if (!(data.monto > 0)) {
    return {
      error:
        "Este paciente no tiene monto por sesión configurado. Cargalo desde su ficha antes de agendar un turno.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("turno").update(data).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/turnos");
  redirect("/turnos");
}

export async function eliminarTurno(id: string) {
  const supabase = await createClient();
  await supabase.from("turno").delete().eq("id", id);
  revalidatePath("/turnos");
  // Se llama desde /turnos/[id]: sin redirect, el re-render busca un turno que
  // ya no existe y cae en notFound().
  redirect("/turnos");
}
