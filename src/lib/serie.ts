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

// Por qué un turno del alcance no se cancela. Los ya cancelados no entran acá:
// no son un salteo, simplemente no aplican.
export type MotivoSalteo = "realizado" | "pagado" | "pasado";

export type PlanCancelacion = {
  cancelables: { id: string; fecha: string }[];
  salteados: { id: string; fecha: string; motivo: MotivoSalteo }[];
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

// Qué se cancela y qué se saltea. Lo usan el cliente para armar el resumen que
// se muestra antes de confirmar y la server action para decidir qué escribe:
// el resumen en pantalla es UX, la barrera real es el server.
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

  // "Solo este turno" es el comportamiento de siempre: cancelar el turno que
  // se está editando, sin reglas de protección ni resumen.
  if (alcance === "solo") {
    return {
      cancelables: enAlcance.map(({ id, fecha }) => ({ id, fecha })),
      salteados: [],
    };
  }

  const plan: PlanCancelacion = { cancelables: [], salteados: [] };

  for (const turno of enAlcance) {
    if (turno.estado === "cancelado") {
      continue;
    }
    if (turno.estado === "realizado") {
      plan.salteados.push({ id: turno.id, fecha: turno.fecha, motivo: "realizado" });
      continue;
    }
    if (turno.pagado) {
      plan.salteados.push({ id: turno.id, fecha: turno.fecha, motivo: "pagado" });
      continue;
    }
    if (turno.fecha < hoy) {
      plan.salteados.push({ id: turno.id, fecha: turno.fecha, motivo: "pasado" });
      continue;
    }

    plan.cancelables.push({ id: turno.id, fecha: turno.fecha });
  }

  return plan;
}
