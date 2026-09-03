import Link from "next/link";
import type { ResumenRecurrencia } from "./actions";
import { formatearDiaCorto } from "@/lib/agenda";

// Los turnos de la serie se crean siempre; esto es el parte de lo que quedó
// pisado, fuera de horario o sin crear. Lo usan el alta con recurrencia y el
// repetir de un turno existente.
export function ResumenRecurrenciaAviso({ resumen }: { resumen: ResumenRecurrencia }) {
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-medium text-gray-900">
        Se crearon {resumen.creados} turnos, del {formatearDiaCorto(resumen.desde)} al{" "}
        {formatearDiaCorto(resumen.hasta)}.
      </p>

      {resumen.omitidas > 0 && (
        <p className="text-sm text-amber-900">
          {resumen.omitidas === 1
            ? "Se omitió 1 fecha anterior a hoy."
            : `Se omitieron ${resumen.omitidas} fechas anteriores a hoy.`}
        </p>
      )}

      {resumen.colisiones.length > 0 && (
        <div>
          <p className="text-sm font-medium text-amber-900">
            {resumen.colisiones.length === 1
              ? "1 turno se superpone con otro que ya existía:"
              : `${resumen.colisiones.length} turnos se superponen con otros que ya existían:`}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-amber-900">
            {resumen.colisiones.map((c) => (
              <li key={`${c.fecha}-${c.hora}-${c.con}`}>
                {formatearDiaCorto(c.fecha)} — pisa a {c.con} ({c.hora})
              </li>
            ))}
          </ul>
        </div>
      )}

      {resumen.fueraDeHorario.length > 0 && (
        <div>
          <p className="text-sm font-medium text-amber-900">
            {resumen.fueraDeHorario.length === 1
              ? "1 turno quedó fuera de tu disponibilidad:"
              : `${resumen.fueraDeHorario.length} turnos quedaron fuera de tu disponibilidad:`}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-amber-900">
            {resumen.fueraDeHorario.map((fecha) => (
              <li key={fecha}>{formatearDiaCorto(fecha)}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-gray-600">
        Están todos cargados. Revisalos en el calendario y ajustá los que haga falta.
      </p>
      <Link
        href="/turnos"
        className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Ir al calendario
      </Link>
    </div>
  );
}
