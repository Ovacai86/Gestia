import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Turno } from "@/types/turno";
import { TurnoForm } from "../TurnoForm";
import { actualizarTurno, eliminarTurno } from "../actions";

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
    supabase
      .from("paciente")
      .select("id, nombre_apellido, monto_fijo")
      .eq("activo", true)
      .order("nombre_apellido"),
    supabase
      .from("paciente")
      .select("id, nombre_apellido, monto_fijo")
      .eq("id", turno.paciente_id)
      .maybeSingle(),
  ]);

  const pacientes =
    pacienteActual && !activos?.some((p) => p.id === pacienteActual.id)
      ? [...(activos ?? []), pacienteActual]
      : (activos ?? []);

  const actualizarEsteTurno = actualizarTurno.bind(null, id);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Editar turno</h1>
        {/* El calendario reemplazó al listado, que era donde estaba Eliminar. */}
        <form action={eliminarTurno.bind(null, id)}>
          <button type="submit" className="text-sm text-red-600 hover:underline">
            Eliminar
          </button>
        </form>
      </div>
      <TurnoForm action={actualizarEsteTurno} pacientes={pacientes} turno={turno} />
    </div>
  );
}
