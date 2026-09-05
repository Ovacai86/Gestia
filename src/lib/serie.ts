import { diaSemanaDe, fechaHoraEnAR } from "@/lib/agenda";
import type { TurnoEstado } from "@/types/turno";

// Una serie no existe como fila en la base: es el conjunto de turnos del mismo
// paciente que caen el mismo día de la semana y a la misma hora. Se arma en
// memoria, leyendo cada fecha_hora en calendario AR — el día de la semana y la
// hora dependen de la timezone, y el server corre en UTC.

export type TurnoSerieRow = {
  id: string;
  fecha_hora: string;
  estado: TurnoEstado;
  pagado: boolean;
};

export type TurnoDeSerie = {
  id: string;
  fecha: string;
  estado: TurnoEstado;
  pagado: boolean;
};

export const ALCANCES_CANCELACION = ["solo", "siguientes", "serie"] as const;
export type AlcanceCancelacion = (typeof ALCANCES_CANCELACION)[number];

// Por qué un turno del alcance no se cancela.
export type MotivoSalteo = "realizado" | "pagado" | "pasado";

export type PlanCancelacion = {
  cancelables: { id: string; fecha: string }[];
  salteados: { id: string; fecha: string; motivo: MotivoSalteo }[];
  // Los que ya estaban cancelados. No son un salteo (no hay nada que hacerles),
  // pero se listan igual: omitirlos en silencio hacía que el resumen no
  // explicara por qué un turno de la serie no aparecía en ninguna lista, y eso
  // se leía como que la cancelación ya se había aplicado sola.
  yaCancelados: { id: string; fecha: string }[];
};

export function esAlcanceValido(valor: string): valor is AlcanceCancelacion {
  return (ALCANCES_CANCELACION as readonly string[]).includes(valor);
}

// Los turnos del paciente que comparten día de la semana y hora con la
// referencia, ordenados por fecha. Incluye al turno de referencia.
export function armarSerie(
  turnosDelPaciente: TurnoSerieRow[],
  referencia: { fecha: string; hora: string },
): TurnoDeSerie[] {
  const dia = diaSemanaDe(referencia.fecha);

  return turnosDelPaciente
    .map((turno) => ({ turno, ...fechaHoraEnAR(turno.fecha_hora) }))
    .filter(({ fecha, hora }) => hora === referencia.hora && diaSemanaDe(fecha) === dia)
    .map(({ turno, fecha }) => ({
      id: turno.id,
      fecha,
      estado: turno.estado,
      pagado: turno.pagado,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Qué turnos toca cada alcance, antes de mirar si se pueden cancelar.
export function turnosEnAlcance(
  serie: TurnoDeSerie[],
  alcance: AlcanceCancelacion,
  actual: { id: string; fecha: string },
): TurnoDeSerie[] {
  switch (alcance) {
    case "solo":
      return serie.filter((t) => t.id === actual.id);
    case "siguientes":
      return serie.filter((t) => t.fecha >= actual.fecha);
    case "serie":
      return serie;
  }
}

// Por qué un turno no se cancela al arrastrarlo dentro de un alcance. Null si
// se puede cancelar. Se exporta aparte porque "Solo este turno" no aplica estas
// reglas pero igual las muestra como aviso antes de confirmar.
export function motivoDeProteccion(turno: TurnoDeSerie, hoy: string): MotivoSalteo | null {
  if (turno.estado === "realizado") {
    return "realizado";
  }
  if (turno.pagado) {
    return "pagado";
  }
  if (turno.fecha < hoy) {
    return "pasado";
  }
  return null;
}

// Qué se cancela, qué se saltea y qué ya estaba cancelado. Lo usan el cliente
// para armar el resumen que se muestra antes de confirmar y la server action
// para decidir qué escribe: el resumen en pantalla es UX, la barrera real es el
// server.
export function planificarCancelacion({
  serie,
  actual,
  alcance,
  hoy,
}: {
  serie: TurnoDeSerie[];
  actual: { id: string; fecha: string };
  alcance: AlcanceCancelacion;
  hoy: string;
}): PlanCancelacion {
  const enAlcance = turnosEnAlcance(serie, alcance, actual);
  const plan: PlanCancelacion = { cancelables: [], salteados: [], yaCancelados: [] };

  for (const turno of enAlcance) {
    const { id, fecha } = turno;

    if (turno.estado === "cancelado") {
      plan.yaCancelados.push({ id, fecha });
      continue;
    }

    // "Solo este turno" sigue sin reglas de protección: es el turno que se está
    // editando, elegido a mano, y equivale a poner Estado = Cancelado arriba y
    // guardar. Lo que cambió es que ahora también pasa por el resumen, donde el
    // aviso de que está realizado, pagado o pasado se muestra igual.
    const motivo = alcance === "solo" ? null : motivoDeProteccion(turno, hoy);

    if (motivo) {
      plan.salteados.push({ id, fecha, motivo });
      continue;
    }

    plan.cancelables.push({ id, fecha });
  }

  return plan;
}
