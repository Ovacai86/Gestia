"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import type { CancelarSerieState } from "./actions";
import {
  planificarCancelacion,
  turnosEnAlcance,
  type AlcanceCancelacion,
  type MotivoSalteo,
  type TurnoDeSerie,
} from "@/lib/serie";
import { formatearDiaCorto } from "@/lib/agenda";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MOTIVO_LABELS: Record<MotivoSalteo, string> = {
  realizado: "ya realizado",
  pagado: "ya pagado",
  pasado: "turno pasado",
};

// Con una serie larga la lista de fechas a cancelar se corta: el detalle
// completo está en el calendario, acá alcanza con el orden de magnitud.
const MAX_FECHAS_LISTADAS = 12;

function turnos(n: number): string {
  return n === 1 ? "1 turno" : `${n} turnos`;
}

// Cancelación al estilo Outlook: solo este turno, este y los siguientes, o toda
// la serie. Las dos últimas pasan por un resumen antes de escribir nada, porque
// tocan turnos que no están en pantalla.
export function CancelarSerieForm({
  action,
  serie,
  actualId,
  actualFecha,
  paciente,
  diaYHora,
  hoy,
}: {
  action: (state: CancelarSerieState, formData: FormData) => Promise<CancelarSerieState>;
  serie: TurnoDeSerie[];
  actualId: string;
  actualFecha: string;
  paciente: string;
  // "lunes a las 15:00", ya en minúscula para que entre en una oración.
  diaYHora: string;
  // El hoy en calendario AR lo calcula el servidor: si lo resolviera el
  // cliente, la primera pintada podría no coincidir con la del server.
  hoy: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [abierto, setAbierto] = useState(false);
  const [alcance, setAlcance] = useState<AlcanceCancelacion>("solo");
  const [motivo, setMotivo] = useState("");
  const [enResumen, setEnResumen] = useState(false);

  const actual = useMemo(() => ({ id: actualId, fecha: actualFecha }), [actualId, actualFecha]);

  // El mismo plan que va a rehacer la server action al confirmar.
  const plan = useMemo(
    () => planificarCancelacion({ serie, actual, alcance, hoy }),
    [serie, actual, alcance, hoy],
  );

  const primera = serie[0].fecha;
  const ultima = serie[serie.length - 1].fecha;

  const opciones = useMemo(() => {
    // Los números al costado son turnos del alcance, no turnos que se van a
    // cancelar: el descuento por las reglas de protección se ve en el resumen.
    const siguientes = turnosEnAlcance(serie, "siguientes", actual).length;

    return [
      {
        valor: "solo" as const,
        titulo: "Solo este turno",
        detalle: `Cancela el turno del ${formatearDiaCorto(actual.fecha)} y nada más.`,
        cantidad: null,
      },
      {
        valor: "siguientes" as const,
        titulo: "Este y los siguientes",
        detalle: `Del ${formatearDiaCorto(actual.fecha)} en adelante.`,
        cantidad: siguientes,
      },
      {
        valor: "serie" as const,
        titulo: "Toda la serie",
        detalle: `Del ${formatearDiaCorto(primera)} al ${formatearDiaCorto(ultima)}, pasados y futuros.`,
        cantidad: serie.length,
      },
    ];
  }, [serie, actual, primera, ultima]);

  const elegida = opciones.find((o) => o.valor === alcance)!;

  const fechasACancelar = useMemo(() => {
    const fechas = plan.cancelables.map((t) => formatearDiaCorto(t.fecha));
    const visibles = fechas.slice(0, MAX_FECHAS_LISTADAS).join(" · ");
    const resto = fechas.length - MAX_FECHAS_LISTADAS;
    return resto > 0 ? `${visibles} … y ${resto} más` : visibles;
  }, [plan]);

  function enviar() {
    const formData = new FormData();
    formData.set("alcance", alcance);
    formData.set("motivo", motivo);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <div className="mx-auto mt-8 max-w-lg space-y-3 rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-600">
        Este turno es parte de una serie: {paciente}, todos los {diaYHora} ({turnos(serie.length)},
        del {formatearDiaCorto(primera)} al {formatearDiaCorto(ultima)}).
      </p>

      {!abierto && (
        <Button type="button" variant="destructive" onClick={() => setAbierto(true)}>
          Cancelar turnos de la serie
        </Button>
      )}

      {abierto && !enResumen && (
        <div className="space-y-4 border-t border-gray-200 pt-3">
          <div className="space-y-1">
            {opciones.map((opcion) => (
              <Label
                key={opcion.valor}
                className="flex w-full items-start gap-2 rounded-md p-2 hover:bg-gray-50"
              >
                <input
                  type="radio"
                  name="alcance"
                  value={opcion.valor}
                  checked={alcance === opcion.valor}
                  onChange={() => setAlcance(opcion.valor)}
                  className="mt-1 accent-gray-900"
                />
                <span className="flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900">{opcion.titulo}</span>
                    {opcion.cantidad != null && (
                      <span className="text-xs font-normal text-gray-500">
                        {turnos(opcion.cantidad)}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-gray-500">
                    {opcion.detalle}
                  </span>
                </span>
              </Label>
            ))}
          </div>

          <div>
            <Label htmlFor="motivo-cancelacion-serie">Motivo de cancelación (opcional)</Label>
            <Textarea
              id="motivo-cancelacion-serie"
              rows={2}
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-gray-500">
              Se guarda en todos los turnos que se cancelen.
            </p>
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <div className="flex items-center gap-4">
            {/* "Solo este turno" no lleva resumen: es lo mismo que poner Estado
                = Cancelado arriba y guardar. */}
            {alcance === "solo" ? (
              <Button type="button" variant="destructive" onClick={enviar} disabled={pending}>
                {pending ? "Cancelando…" : "Cancelar este turno"}
              </Button>
            ) : (
              <Button type="button" onClick={() => setEnResumen(true)}>
                Ver resumen
              </Button>
            )}
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {abierto && enResumen && (
        <div className="space-y-3 border-t border-gray-200 pt-3">
          <p className="text-sm font-medium text-gray-900">
            {elegida.titulo} · {diaYHora}
          </p>

          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            {plan.cancelables.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Se {plan.cancelables.length === 1 ? "cancela" : "cancelan"}{" "}
                  {turnos(plan.cancelables.length)}
                </p>
                <p className="mt-1 text-sm text-amber-900">{fechasACancelar}</p>
              </div>
            ) : (
              <p className="text-sm font-medium text-gray-900">No hay ningún turno para cancelar.</p>
            )}

            {plan.salteados.length > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-900">
                  Se {plan.salteados.length === 1 ? "saltea" : "saltean"}{" "}
                  {turnos(plan.salteados.length)}
                </p>
                <ul className="mt-1 space-y-0.5 text-sm text-amber-900">
                  {plan.salteados.map((salteado) => (
                    <li key={salteado.id}>
                      {formatearDiaCorto(salteado.fecha)} — {MOTIVO_LABELS[salteado.motivo]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="destructive"
              onClick={enviar}
              disabled={pending || plan.cancelables.length === 0}
            >
              {pending
                ? "Cancelando…"
                : plan.cancelables.length === 0
                  ? "Confirmar"
                  : `Confirmar: cancelar ${turnos(plan.cancelables.length)}`}
            </Button>
            <button
              type="button"
              onClick={() => setEnResumen(false)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Volver
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
