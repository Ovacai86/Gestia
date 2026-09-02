"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { TurnoEstado } from "@/types/turno";

export type TurnoFormState = { error: string | null };

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
  const { error } = await supabase.from("turno").insert(data);

  if (error) {
    return { error: error.message };
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

export async function eliminarTurno(id: string) {
  const supabase = await createClient();
  await supabase.from("turno").delete().eq("id", id);
  revalidatePath("/turnos");
  // Se llama desde /turnos/[id]: sin redirect, el re-render busca un turno que
  // ya no existe y cae en notFound().
  redirect("/turnos");
}
