"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DIAS_SEMANA, HORARIO_POR_DEFECTO } from "@/types/disponibilidad";
import { aMinutos, fechaHoraEnAR, inicioDelDiaISO, sumarDias } from "@/lib/agenda";

export type AgendaFormState = { error: string | null; guardado: boolean };

type FranjaInput = { hora_inicio: string; hora_fin: string };

type DiaInput = {
  dia_semana: number;
  activo: boolean;
  franjas: FranjaInput[];
};

type AgendaInput = {
  // String vacío = duración sin configurar.
  duracion: string;
  dias: DiaInput[];
};

function readAgendaForm(formData: FormData): AgendaInput {
  const dias = DIAS_SEMANA.map((_, i) => {
    const cantidad = Number(formData.get(`dias.${i}.franjas.length`) ?? 0);
    const franjas: FranjaInput[] = [];

    for (let j = 0; j < cantidad; j++) {
      franjas.push({
        hora_inicio: String(formData.get(`dias.${i}.franjas.${j}.hora_inicio`) ?? "").trim(),
        hora_fin: String(formData.get(`dias.${i}.franjas.${j}.hora_fin`) ?? "").trim(),
      });
    }

    return {
      dia_semana: i,
      activo: formData.get(`dias.${i}.activo`) === "true",
      franjas,
    };
  });

  return {
    duracion: String(formData.get("duracion_bloque_minutos") ?? "").trim(),
    dias,
  };
}

function validarAgenda(agenda: AgendaInput): string | null {
  const hayDiaActivo = agenda.dias.some((dia) => dia.activo);

  // Sin ningún día activo la duración puede quedar vacía: no hay bloques que
  // medir. Con al menos un día activo, es obligatoria.
  if (hayDiaActivo) {
    if (!agenda.duracion) {
      return "Poné una duración para los turnos.";
    }
    const duracion = Number(agenda.duracion);
    if (!Number.isInteger(duracion) || duracion <= 0) {
      return "La duración tiene que ser un número entero de minutos mayor a cero.";
    }
  }

  for (const dia of agenda.dias) {
    if (!dia.activo) {
      continue;
    }

    const nombre = DIAS_SEMANA[dia.dia_semana];

    if (dia.franjas.length === 0) {
      return `Agregá al menos una franja para ${nombre}.`;
    }

    for (const franja of dia.franjas) {
      if (!franja.hora_inicio || !franja.hora_fin) {
        return `Completá los horarios de ${nombre}.`;
      }
      if (franja.hora_fin <= franja.hora_inicio) {
        return `En ${nombre} la hora de fin tiene que ser posterior al inicio.`;
      }
    }

    const ordenadas = [...dia.franjas].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    for (let n = 1; n < ordenadas.length; n++) {
      if (ordenadas[n].hora_inicio < ordenadas[n - 1].hora_fin) {
        return `Las franjas de ${nombre} se pisan entre sí.`;
      }
    }
  }

  return null;
}

// Un día apagado puede llegar sin franjas o con horarios incompletos, pero se
// guardan igual para no perder lo cargado. Lo inconsistente cae al default.
function franjasParaGuardar(dia: DiaInput): FranjaInput[] {
  if (dia.franjas.length === 0) {
    return [{ hora_inicio: HORARIO_POR_DEFECTO.inicio, hora_fin: HORARIO_POR_DEFECTO.fin }];
  }

  return dia.franjas.map((franja) => {
    const hora_inicio = franja.hora_inicio || HORARIO_POR_DEFECTO.inicio;
    const hora_fin = franja.hora_fin || HORARIO_POR_DEFECTO.fin;
    if (hora_fin <= hora_inicio) {
      return { hora_inicio: HORARIO_POR_DEFECTO.inicio, hora_fin: HORARIO_POR_DEFECTO.fin };
    }
    return { hora_inicio, hora_fin };
  });
}

export async function guardarAgenda(
  _prevState: AgendaFormState,
  formData: FormData,
): Promise<AgendaFormState> {
  const agenda = readAgendaForm(formData);
  const error = validarAgenda(agenda);
  if (error) {
    return { error, guardado: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Se venció la sesión. Volvé a entrar.", guardado: false };
  }

  // La duración es una sola para toda la agenda. Si el campo vino vacío se
  // borra la fila: la duración vuelve a quedar sin configurar.
  const duracion = Number(agenda.duracion);
  if (agenda.duracion && Number.isInteger(duracion) && duracion > 0) {
    const { error: configError } = await supabase
      .from("configuracion_agenda")
      .upsert({ user_id: user.id, duracion_bloque_minutos: duracion }, { onConflict: "user_id" });

    if (configError) {
      return { error: configError.message, guardado: false };
    }
  } else {
    const { error: configError } = await supabase
      .from("configuracion_agenda")
      .delete()
      .eq("user_id", user.id);

    if (configError) {
      return { error: configError.message, guardado: false };
    }
  }

  // user_id va explícito (y no por el default auth.uid()) para que el
  // onConflict tenga con qué resolver el upsert.
  const { data: guardados, error: diasError } = await supabase
    .from("disponibilidad")
    .upsert(
      agenda.dias.map((dia) => ({
        user_id: user.id,
        dia_semana: dia.dia_semana,
        activo: dia.activo,
      })),
      { onConflict: "user_id,dia_semana" },
    )
    .select("id, dia_semana");

  if (diasError) {
    return { error: diasError.message, guardado: false };
  }

  // Las franjas se reemplazan enteras: el form no trae los id de cada una, y
  // borrar e insertar evita tener que reconciliar altas, bajas y cambios.
  const idPorDia = new Map((guardados ?? []).map((d) => [d.dia_semana, d.id]));
  const { error: borradoError } = await supabase
    .from("franja_horaria")
    .delete()
    .in("disponibilidad_id", [...idPorDia.values()]);

  if (borradoError) {
    return { error: borradoError.message, guardado: false };
  }

  const filas = agenda.dias.flatMap((dia) => {
    const disponibilidadId = idPorDia.get(dia.dia_semana);
    if (!disponibilidadId) {
      return [];
    }
    return franjasParaGuardar(dia).map((franja) => ({
      disponibilidad_id: disponibilidadId,
      user_id: user.id,
      ...franja,
    }));
  });

  const { error: franjasError } = await supabase.from("franja_horaria").insert(filas);
  if (franjasError) {
    return { error: franjasError.message, guardado: false };
  }

  revalidatePath("/turnos/configuracion");
  revalidatePath("/turnos");
  return { error: null, guardado: true };
}

// Un turno ya agendado que quedó adentro de la excepción. No se toca: se lista
// para que el profesional decida qué hacer con cada uno.
export type TurnoEnConflicto = {
  id: string;
  hora: string;
  paciente: string;
};

export type ExcepcionFormState = {
  error: string | null;
  guardado: boolean;
  fecha?: string;
  conflictos?: TurnoEnConflicto[];
};

type TurnoDelDia = {
  id: string;
  fecha_hora: string;
  duracion_minutos: number;
  paciente: { nombre_apellido: string } | null;
};

// Los turnos vivos de ese día que se solapan con el rango bloqueado. Se calcula
// después de guardar: la excepción se crea igual, esto es solo el aviso.
async function turnosEnConflicto(
  fecha: string,
  horaInicio: string,
  horaFin: string,
): Promise<TurnoEnConflicto[]> {
  const supabase = await createClient();

  const { data: turnos } = await supabase
    .from("turno")
    .select("id, fecha_hora, duracion_minutos, paciente(nombre_apellido)")
    .neq("estado", "cancelado")
    .gte("fecha_hora", inicioDelDiaISO(fecha))
    .lt("fecha_hora", inicioDelDiaISO(sumarDias(fecha, 1)))
    .order("fecha_hora")
    .returns<TurnoDelDia[]>();

  const desde = aMinutos(horaInicio);
  const hasta = aMinutos(horaFin);

  return (turnos ?? [])
    .filter((turno) => {
      const { hora } = fechaHoraEnAR(turno.fecha_hora);
      const inicio = aMinutos(hora);
      // Mismo criterio que en la agenda: alcanza con que se solapen.
      return desde < inicio + turno.duracion_minutos && inicio < hasta;
    })
    .map((turno) => ({
      id: turno.id,
      hora: fechaHoraEnAR(turno.fecha_hora).hora,
      paciente: turno.paciente?.nombre_apellido ?? "Sin paciente",
    }));
}

// "Día completo" se guarda siempre como 00:00–23:59: no depende de los horarios
// configurados, así que sigue bloqueando aunque después se amplíe la semana.
const DIA_COMPLETO = { inicio: "00:00", fin: "23:59" } as const;

export async function agregarExcepcion(
  _prevState: ExcepcionFormState,
  formData: FormData,
): Promise<ExcepcionFormState> {
  const fecha = String(formData.get("fecha") ?? "").trim();
  const diaCompleto = formData.get("dia_completo") === "on";
  const horaInicio = diaCompleto
    ? DIA_COMPLETO.inicio
    : String(formData.get("hora_inicio") ?? "").trim();
  const horaFin = diaCompleto ? DIA_COMPLETO.fin : String(formData.get("hora_fin") ?? "").trim();

  if (!fecha) {
    return { error: "La fecha es obligatoria.", guardado: false };
  }
  if (!horaInicio || !horaFin) {
    return { error: "Poné desde y hasta qué hora se bloquea.", guardado: false };
  }
  if (horaFin <= horaInicio) {
    return { error: "La hora de fin tiene que ser posterior a la de inicio.", guardado: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("excepcion_disponibilidad")
    .insert({ fecha, hora_inicio: horaInicio, hora_fin: horaFin });

  if (error) {
    return { error: error.message, guardado: false };
  }

  revalidatePath("/turnos/configuracion");
  revalidatePath("/turnos");

  // La excepción ya está guardada: los turnos que quedaron adentro no se tocan
  // ni se cancelan, solo se informan para resolverlos a mano.
  return {
    error: null,
    guardado: true,
    fecha,
    conflictos: await turnosEnConflicto(fecha, horaInicio, horaFin),
  };
}

export async function eliminarExcepcion(id: string) {
  const supabase = await createClient();
  await supabase.from("excepcion_disponibilidad").delete().eq("id", id);
  revalidatePath("/turnos/configuracion");
  revalidatePath("/turnos");
}
