"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DIAS_SEMANA, HORARIO_POR_DEFECTO } from "@/types/disponibilidad";

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
