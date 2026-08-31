import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Turno } from "@/types/turno";
import { TurnoForm } from "../TurnoForm";
import { actualizarTurno } from "../actions";

export default async function EditarTurnoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: turno } = await supabase
    .from("turno")
    .select("*")
    .eq("id", id)
    .returns<Turno[]>()
    .single();

  if (!turno) {
    notFound();
  }

  // Incluimos el paciente actual del turno aunque esté inactivo, para no
  // perder la selección al editar (si no, el <select> cae en otra opción).
  const [{ data: activos }, { data: pacienteActual }] = await Promise.all([
    supabase.from("paciente").select("id, nombre_apellido").eq("activo", true).order("nombre_apellido"),
    supabase.from("paciente").select("id, nombre_apellido").eq("id", turno.paciente_id).maybeSingle(),
  ]);

  const pacientes =
    pacienteActual && !activos?.some((p) => p.id === pacienteActual.id)
      ? [...(activos ?? []), pacienteActual]
      : (activos ?? []);

  const actualizarEsteTurno = actualizarTurno.bind(null, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Editar turno</h1>
      <TurnoForm action={actualizarEsteTurno} pacientes={pacientes} turno={turno} />
    </div>
  );
}
