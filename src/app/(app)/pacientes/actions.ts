"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type PacienteFormState = { error: string | null };

function readPacienteForm(formData: FormData) {
  return {
    nombre_apellido: String(formData.get("nombre_apellido") ?? "").trim(),
    dni: String(formData.get("dni") ?? "").trim() || null,
    telefono: String(formData.get("telefono") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    obra_social: String(formData.get("obra_social") ?? "").trim() || null,
    notas: String(formData.get("notas") ?? "").trim() || null,
    activo: formData.get("activo") === "on",
  };
}

export async function crearPaciente(
  _prevState: PacienteFormState,
  formData: FormData,
): Promise<PacienteFormState> {
  const data = readPacienteForm(formData);

  if (!data.nombre_apellido) {
    return { error: "El nombre es obligatorio." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("paciente").insert(data);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/pacientes");
  redirect("/pacientes");
}

export async function actualizarPaciente(
  id: string,
  _prevState: PacienteFormState,
  formData: FormData,
): Promise<PacienteFormState> {
  const data = readPacienteForm(formData);

  if (!data.nombre_apellido) {
    return { error: "El nombre es obligatorio." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("paciente").update(data).eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/pacientes");
  redirect("/pacientes");
}

export async function eliminarPaciente(id: string) {
  const supabase = await createClient();
  await supabase.from("paciente").delete().eq("id", id);
  revalidatePath("/pacientes");
}
