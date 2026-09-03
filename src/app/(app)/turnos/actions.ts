"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Turno, TurnoEstado } from "@/types/turno";
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
  // La del turno que se está creando.
  hora: string;
  // La del turno que ya existía, que puede ser otra: los turnos chocan por
  // solaparse, no por arrancar a la misma hora.
  horaExistente: string;
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
  // Semanas que no se crearon por caer antes de hoy. Solo puede pasar al
  // repetir un turno viejo; en el alta siempre es 0.
  omitidas: number;
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
  const montoCrudo = String(formData.get("monto") ?? "").trim();
  const duracion = Number(formData.get("duracion_minutos") ?? 50);
  const estado = String(formData.get("estado") ?? "programado") as TurnoEstado;
  const motivoCancelacion = String(formData.get("motivo_cancelacion") ?? "").trim();

  return {
    paciente_id: String(formData.get("paciente_id") ?? ""),
    fecha_hora: fechaHoraLocal ? new Date(`${fechaHoraLocal}:00-03:00`).toISOString() : null,
    duracion_minutos: Number.isFinite(duracion) && duracion > 0 ? duracion : 50,
    estado,
    // Sin monto se guarda null, no cero: son cosas distintas, y el balance
    // trata el null como cero al sumar.
    monto: montoCrudo && Number.isFinite(Number(montoCrudo)) ? Number(montoCrudo) : null,
    pagado: formData.get("pagado") === "on",
    motivo_cancelacion: estado === "cancelado" && motivoCancelacion ? motivoCancelacion : null,
  };
}

// Las fechas de la serie: la inicial y después una por semana, hasta la fecha
// de fin inclusive.
function fechasSemanales(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  // El corte va en MAX + 1: alcanza para detectar que se pasó del tope sin
  // recorrer una fecha de fin lejanísima semana por semana.
  for (let f = desde; f <= hasta && fechas.length <= MAX_TURNOS_RECURRENTES; f = sumarDias(f, 7)) {
    fechas.push(f);
  }
  return fechas;
}

type TurnoExistente = {
  fecha_hora: string;
  duracion_minutos: number;
  paciente: { nombre_apellido: string } | null;
};

// Lo que comparten todos los turnos de una serie. El resto (fecha y hora) sale
// de cada fecha generada.
type BaseSerie = {
  paciente_id: string;
  duracion_minutos: number;
  estado: TurnoEstado;
  monto: number | null;
  pagado: boolean;
  motivo_cancelacion: string | null;
};

function hayAlgoQueAvisar(resumen?: ResumenRecurrencia | null): boolean {
  if (!resumen) {
    return false;
  }
  return (
    resumen.colisiones.length > 0 || resumen.fueraDeHorario.length > 0 || resumen.omitidas > 0
  );
}

// Crea los turnos de una serie semanal y devuelve el parte de lo que quedó
// pisado o fuera de horario. Es la misma lógica para el alta con recurrencia y
// para repetir un turno que ya existe.
async function generarSerieSemanal({
  base,
  fechas,
  hora,
  omitidas,
}: {
  base: BaseSerie;
  fechas: string[];
  hora: string;
  omitidas: number;
}): Promise<TurnoFormState> {
  const supabase = await createClient();

  const filas = fechas.map((fecha) => ({
    ...base,
    fecha_hora: new Date(`${fecha}T${hora}:00-03:00`).toISOString(),
  }));

  const primera = fechas[0];
  const ultima = fechas[fechas.length - 1];

  // Se buscan de una sola vez los turnos que ya existen en todo el rango, y
  // las colisiones se resuelven en memoria. Los cancelados no ocupan horario,
  // así que no cuentan como choque.
  const [{ data: existentes }, { data: disponibilidades }] = await Promise.all([
    supabase
      .from("turno")
      .select("fecha_hora, duracion_minutos, paciente(nombre_apellido)")
      .neq("estado", "cancelado")
      .gte("fecha_hora", inicioDelDiaISO(primera))
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
        hora,
        horaExistente: fechaHoraEnAR(choque.fecha_hora).hora,
        con: choque.paciente?.nombre_apellido ?? "otro turno",
      });
    }

    if (!caeEnDisponibilidad(fecha, hora, disponibilidades ?? [])) {
      fueraDeHorario.push(fecha);
    }
  });

  const { error } = await supabase.from("turno").insert(filas);

  if (error) {
    return { error: error.message };
  }

  return {
    error: null,
    resumen: {
      creados: filas.length,
      desde: primera,
      hasta: ultima,
      colisiones,
      fueraDeHorario,
      omitidas,
    },
  };
}

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
  if (fechas.length > MAX_TURNOS_RECURRENTES) {
    return {
      error: `La recurrencia genera más de ${MAX_TURNOS_RECURRENTES} turnos. Acortá la fecha de fin.`,
    };
  }

  const resultado = await generarSerieSemanal({
    base: data,
    fechas,
    hora: horaInicial,
    omitidas: 0,
  });

  if (resultado.error) {
    return { error: resultado.error };
  }

  // Con algo para avisar no se redirige: el resumen se muestra en el form.
  // Acá no se revalida /turnos a propósito: al quedarse en el formulario, el
  // refresh del router deja la pestaña trabada un rato largo. El calendario es
  // una ruta dinámica, así que se vuelve a pedir al servidor cuando se navega.
  if (hayAlgoQueAvisar(resultado.resumen)) {
    return resultado;
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

  const supabase = await createClient();
  const { error } = await supabase.from("turno").update(data).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/turnos");
  redirect("/turnos");
}

// Repite un turno que ya existe: crea las semanas siguientes con los mismos
// paciente, duración y monto. El turno original no se toca ni se duplica, y las
// repeticiones nacen programadas y sin pagar aunque el original no lo esté.
export async function repetirTurno(
  id: string,
  _prevState: TurnoFormState,
  formData: FormData,
): Promise<TurnoFormState> {
  const supabase = await createClient();

  const { data: turno } = await supabase
    .from("turno")
    .select("*")
    .eq("id", id)
    .returns<Turno[]>()
    .maybeSingle();

  if (!turno) {
    return { error: "No encontramos el turno que querés repetir." };
  }

  // La fecha y la hora salen del turno leídas en calendario AR: la serie repite
  // el mismo día de la semana y el mismo horario que el original.
  const { fecha: fechaTurno, hora } = fechaHoraEnAR(turno.fecha_hora);
  const fechaFin = String(formData.get("fecha_fin_recurrencia") ?? "").trim();

  if (!esFechaValida(fechaFin)) {
    return { error: "Poné hasta qué fecha se repite el turno." };
  }

  // La serie arranca una semana después: el turno original ya existe.
  const primera = sumarDias(fechaTurno, 7);
  if (fechaFin < primera) {
    return { error: "La fecha de fin tiene que ser al menos una semana posterior al turno." };
  }

  const todas = fechasSemanales(primera, fechaFin);
  if (todas.length > MAX_TURNOS_RECURRENTES) {
    return {
      error: `La recurrencia genera más de ${MAX_TURNOS_RECURRENTES} turnos. Acortá la fecha de fin.`,
    };
  }

  // Repetir un turno viejo no debería crear turnos en el pasado: esas semanas
  // se saltean y se informan en el resumen.
  const hoy = inicioDelDiaISO(new Date().toISOString().slice(0, 10));
  const fechas = todas.filter((fecha) => inicioDelDiaISO(fecha) >= hoy);
  const omitidas = todas.length - fechas.length;

  if (fechas.length === 0) {
    return {
      error:
        "Todas las repeticiones caerían antes de hoy. Elegí una fecha de fin más adelante.",
    };
  }

  const resultado = await generarSerieSemanal({
    base: {
      paciente_id: turno.paciente_id,
      duracion_minutos: turno.duracion_minutos,
      // Las repeticiones nacen limpias: el original puede estar realizado,
      // cancelado o pagado, y eso no se hereda a un turno futuro.
      estado: "programado",
      monto: turno.monto,
      pagado: false,
      motivo_cancelacion: null,
    },
    fechas,
    hora,
    omitidas,
  });

  if (resultado.error) {
    return { error: resultado.error };
  }

  revalidatePath("/turnos");
  // Siempre se muestra el resumen: es la única devolución de que la serie se
  // creó, porque la pantalla no redirige a ningún lado.
  return resultado;
}

export async function eliminarTurno(id: string) {
  const supabase = await createClient();
  await supabase.from("turno").delete().eq("id", id);
  revalidatePath("/turnos");
  // Se llama desde /turnos/[id]: sin redirect, el re-render busca un turno que
  // ya no existe y cae en notFound().
  redirect("/turnos");
}
