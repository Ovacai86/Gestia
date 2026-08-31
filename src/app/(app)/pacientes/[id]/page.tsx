import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Paciente } from "@/types/paciente";
import { PacienteForm } from "../PacienteForm";
import { actualizarPaciente } from "../actions";

export default async function EditarPacientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: paciente } = await supabase
    .from("paciente")
    .select("*")
    .eq("id", id)
    .returns<Paciente[]>()
    .single();

  if (!paciente) {
    notFound();
  }

  const actualizarEstePaciente = actualizarPaciente.bind(null, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Editar paciente</h1>
      <PacienteForm action={actualizarEstePaciente} paciente={paciente} />
    </div>
  );
}
