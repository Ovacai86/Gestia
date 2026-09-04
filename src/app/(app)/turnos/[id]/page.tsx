import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Turno } from "@/types/turno";
import { TurnoForm } from "../TurnoForm";
import { RepetirSerieForm } from "../RepetirSerieForm";
import { CancelarSerieForm } from "../CancelarSerieForm";
import { actualizarTurno, cancelarSerie, eliminarTurno, repetirTurno } from "../actions";
import { DIAS_SEMANA } from "@/types/disponibilidad";
import { armarSerie, type TurnoSerieRow } from "@/lib/serie";
import { diaSemanaDe, fechaHoraEnAR, hoyEnAR, sumarDias } from "@/lib/agenda";

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
  const [{ data: activos }, { data: pacienteActual }, { data: turnosDelPaciente }] =
    await Promise.all([
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
      // Todos los turnos del paciente: la serie se recorta en memoria por día
      // de la semana y hora, que no son columnas y no se pueden filtrar en SQL.
      supabase
        .from("turno")
        .select("id, fecha_hora, estado, pagado")
        .eq("paciente_id", turno.paciente_id)
        .returns<TurnoSerieRow[]>(),
    ]);

  const pacientes =
    pacienteActual && !activos?.some((p) => p.id === pacienteActual.id)
      ? [...(activos ?? []), pacienteActual]
      : (activos ?? []);

  const actualizarEsteTurno = actualizarTurno.bind(null, id);
  const repetirEsteTurno = repetirTurno.bind(null, id);
  const cancelarDesdeEsteTurno = cancelarSerie.bind(null, id);

  // La serie repite el mismo día de la semana y horario del turno, arrancando
  // una semana después: el original no se duplica.
  const { fecha: fechaTurno, hora: horaTurno } = fechaHoraEnAR(turno.fecha_hora);
  const diaYHora = `${DIAS_SEMANA[diaSemanaDe(fechaTurno)]} a las ${horaTurno}`;

  // Los turnos que comparten paciente, día de la semana y hora con este. Con
  // uno solo (este mismo) no hay serie que cancelar.
  const serie = armarSerie(turnosDelPaciente ?? [], { fecha: fechaTurno, hora: horaTurno });

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
      <RepetirSerieForm
        action={repetirEsteTurno}
        primeraFecha={sumarDias(fechaTurno, 7)}
        diaYHora={diaYHora}
      />
      {serie.length > 1 && (
        <CancelarSerieForm
          action={cancelarDesdeEsteTurno}
          serie={serie}
          actualId={id}
          actualFecha={fechaTurno}
          paciente={pacienteActual?.nombre_apellido ?? "este paciente"}
          diaYHora={diaYHora.toLowerCase()}
          hoy={hoyEnAR()}
        />
      )}
    </div>
  );
}
