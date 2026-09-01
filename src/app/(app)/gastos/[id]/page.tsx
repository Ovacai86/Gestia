import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Gasto } from "@/types/gasto";
import { GastoForm } from "../GastoForm";
import { actualizarGasto } from "../actions";

export default async function EditarGastoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: gasto } = await supabase
    .from("gasto")
    .select("*")
    .eq("id", id)
    .returns<Gasto[]>()
    .single();

  if (!gasto) {
    notFound();
  }

  const actualizarEsteGasto = actualizarGasto.bind(null, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Editar gasto</h1>
      <GastoForm action={actualizarEsteGasto} gasto={gasto} />
    </div>
  );
}
