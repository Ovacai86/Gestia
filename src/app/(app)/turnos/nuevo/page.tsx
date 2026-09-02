import { createClient } from "@/lib/supabase/server";
import { TurnoForm } from "../TurnoForm";
import { crearTurno } from "../actions";

// Formato del input datetime-local: "YYYY-MM-DDTHH:MM". Se valida acá porque
// llega por querystring desde el calendario y puede venir cualquier cosa.
const FECHA_HORA_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export default async function NuevoTurnoPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha_hora?: string; duracion?: string }>;
}) {
  const { fecha_hora, duracion } = await searchParams;

  const fechaHoraInicial = fecha_hora && FECHA_HORA_RE.test(fecha_hora) ? fecha_hora : undefined;
  const duracionNumero = Number(duracion);
  const duracionInicial =
    Number.isInteger(duracionNumero) && duracionNumero > 0 ? String(duracionNumero) : undefined;

  const supabase = await createClient();
  const { data: pacientes } = await supabase
    .from("paciente")
    .select("id, nombre_apellido")
    .eq("activo", true)
    .order("nombre_apellido");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Nuevo turno</h1>
      <TurnoForm
        action={crearTurno}
        pacientes={pacientes ?? []}
        fechaHoraInicial={fechaHoraInicial}
        duracionInicial={duracionInicial}
      />
    </div>
  );
}
