"use server";

import { revalidarGastos } from "@/lib/revalidar";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type GastoFormState = { error: string | null };

function readGastoForm(formData: FormData) {
  const monto = Number(formData.get("monto") ?? 0);
  const descripcion = String(formData.get("descripcion") ?? "").trim();

  return {
    fecha: String(formData.get("fecha") ?? ""),
    monto,
    categoria: String(formData.get("categoria") ?? "").trim(),
    descripcion: descripcion || null,
  };
}

function validarGasto(data: ReturnType<typeof readGastoForm>): string | null {
  if (!data.fecha) {
    return "La fecha es obligatoria.";
  }
  if (!data.categoria) {
    return "Elegí una categoría.";
  }
  if (!Number.isFinite(data.monto) || data.monto <= 0) {
    return "El monto debe ser mayor a cero.";
  }
  return null;
}

export async function crearGasto(
  _prevState: GastoFormState,
  formData: FormData,
): Promise<GastoFormState> {
  const data = readGastoForm(formData);
  const error = validarGasto(data);
  if (error) {
    return { error };
  }

  const supabase = await createClient();
  const { error: dbError } = await supabase.from("gasto").insert(data);

  if (dbError) {
    return { error: dbError.message };
  }

  revalidarGastos();
  redirect("/gastos");
}

export async function actualizarGasto(
  id: string,
  _prevState: GastoFormState,
  formData: FormData,
): Promise<GastoFormState> {
  const data = readGastoForm(formData);
  const error = validarGasto(data);
  if (error) {
    return { error };
  }

  const supabase = await createClient();
  const { error: dbError } = await supabase.from("gasto").update(data).eq("id", id);

  if (dbError) {
    return { error: dbError.message };
  }

  revalidarGastos();
  redirect("/gastos");
}

export async function eliminarGasto(id: string) {
  const supabase = await createClient();
  await supabase.from("gasto").delete().eq("id", id);
  revalidarGastos();
}
