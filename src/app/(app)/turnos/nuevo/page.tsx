import { createClient } from "@/lib/supabase/server";
import { TurnoForm } from "../TurnoForm";
import { crearTurno } from "../actions";

export default async function NuevoTurnoPage() {
  const supabase = await createClient();
  const { data: pacientes } = await supabase
    .from("paciente")
    .select("id, nombre_apellido")
    .eq("activo", true)
    .order("nombre_apellido");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Nuevo turno</h1>
      <TurnoForm action={crearTurno} pacientes={pacientes ?? []} />
    </div>
  );
}
