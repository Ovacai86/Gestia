import { createClient } from "@/lib/supabase/server";
import type {
  ConfiguracionAgenda,
  DisponibilidadConFranjas,
  ExcepcionDisponibilidad,
} from "@/types/disponibilidad";
import {
  DIAS_BUSQUEDA_BLOQUE,
  fechaHoraEnAR,
  inicioDelDiaISO,
  primerBloqueLibre,
  sumarDias,
} from "@/lib/agenda";
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
  const { fecha_hora } = await searchParams;

  const fechaHoraInicial = fecha_hora && FECHA_HORA_RE.test(fecha_hora) ? fecha_hora : undefined;

  const supabase = await createClient();
  // El "ahora" se lee en calendario AR, no en la timezone del server.
  const ahora = fechaHoraEnAR(new Date().toISOString());
  const hastaFecha = sumarDias(ahora.fecha, DIAS_BUSQUEDA_BLOQUE);

  // La duración no sale del querystring: es una sola para toda la agenda y el
  // formulario la muestra de solo lectura.
  const [
    { data: pacientes },
    { data: configuracion },
    { data: disponibilidades },
    { data: excepciones },
    { data: ocupados },
  ] = await Promise.all([
    supabase
      .from("paciente")
      .select("id, nombre_apellido, monto_fijo")
      .eq("activo", true)
      .order("nombre_apellido"),
    supabase.from("configuracion_agenda").select("*").maybeSingle<ConfiguracionAgenda>(),
    supabase
      .from("disponibilidad")
      .select("*, franja_horaria(*)")
      .returns<DisponibilidadConFranjas[]>(),
    supabase
      .from("excepcion_disponibilidad")
      .select("*")
      .gte("fecha", ahora.fecha)
      .lte("fecha", hastaFecha)
      .returns<ExcepcionDisponibilidad[]>(),
    // Los cancelados no ocupan horario, igual que al detectar colisiones.
    supabase
      .from("turno")
      .select("fecha_hora, duracion_minutos")
      .neq("estado", "cancelado")
      .gte("fecha_hora", inicioDelDiaISO(ahora.fecha))
      .lt("fecha_hora", inicioDelDiaISO(sumarDias(hastaFecha, 1)))
      .returns<{ fecha_hora: string; duracion_minutos: number }[]>(),
  ]);

  // Llegando desde un bloque del calendario la fecha y la hora ya están
  // elegidas. Entrando derecho se sugiere el primer bloque libre de ahora en
  // adelante; si no hay ninguno, el formulario arranca vacío como antes.
  const sugerido = fechaHoraInicial
    ? null
    : primerBloqueLibre(
        ahora,
        disponibilidades ?? [],
        configuracion?.duracion_bloque_minutos ?? 0,
        excepciones ?? [],
        (ocupados ?? []).map((turno) => ({
          ...fechaHoraEnAR(turno.fecha_hora),
          duracion_minutos: turno.duracion_minutos,
        })),
      );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Nuevo turno</h1>
      <TurnoForm
        action={crearTurno}
        pacientes={pacientes ?? []}
        fechaHoraInicial={fechaHoraInicial}
        fechaHoraSugerida={sugerido ? `${sugerido.fecha}T${sugerido.hora}` : undefined}
        duracionBloque={configuracion?.duracion_bloque_minutos ?? null}
      />
    </div>
  );
}
