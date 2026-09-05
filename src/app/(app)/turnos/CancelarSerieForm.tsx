"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import type { CancelarSerieState } from "./actions";
import {
  motivoDeProteccion,
  planificarCancelacion,
  turnosEnAlcance,
  type AlcanceCancelacion,
  type MotivoSalteo,
  type PlanCancelacion,
  type TurnoDeSerie,
} from "@/lib/serie";
import { formatearDiaCorto } from "@/lib/agenda";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Para las listas, donde va detrás de la fecha: "11 sept — ya realizado".
const MOTIVO_LABELS: Record<MotivoSalteo, string> = {
  realizado: "ya realizado",
  pagado: "ya pagado",
  pasado: "turno pasado",
};

// Para el aviso de "Solo este turno", donde el motivo es el predicado de una
// oración: "Este turno ya está realizado". Las etiquetas de arriba no sirven
// acá: darían "Este turno está turno pasado".
const MOTIVO_EN_ORACION: Record<MotivoSalteo, string> = {
  realizado: "ya está realizado",
  pagado: "ya está pagado",
  pasado: "es un turno pasado",
};

// Con una serie larga las listas de fechas se cortan: el detalle completo está
// en el calendario, acá alcanza con el orden de magnitud.
const MAX_FECHAS_LISTADAS = 12;

function turnos(n: number): string {
  return n === 1 ? "1 turno" : `${n} turnos`;
}

function recortar(fechas: string[]): string[] {
  const resto = fechas.length - MAX_FECHAS_LISTADAS;
  return resto > 0
    ? [...fechas.slice(0, MAX_FECHAS_LISTADAS), `… y ${resto} más`]
    : fechas;
}

// Por qué el resumen no tiene nada para cancelar. Se arma con lo que sí trajo el
// plan, para no decir "están todos pagados" cuando en realidad ya estaban
// cancelados.
function razonSinCancelables(plan: PlanCancelacion): string {
  // El número sale del total del alcance, no de cada lista: el sujeto de la
  // oración es "el turno" o "los turnos", y los verbos tienen que concordar con
  // eso aunque una de las dos listas tenga un solo elemento.
  const total = plan.yaCancelados.length + plan.salteados.length;

  if (total === 0) {
    return "No hay turnos en este alcance.";
  }

  const uno = total === 1;
  const motivos: string[] = [];

  if (plan.yaCancelados.length > 0) {
    motivos.push(uno ? "ya está cancelado" : "ya están cancelados");
  }
  if (plan.salteados.length > 0) {
    motivos.push(
      uno
        ? "está realizado, está pagado o es un turno pasado"
        : "están realizados, están pagados o son turnos pasados",
    );
  }

  const sujeto = uno ? "el turno de este alcance" : "los turnos de este alcance";
  return `No hay nada para cancelar: ${sujeto} ${motivos.join(" o ")}.`;
}

function BloqueDeFechas({
  titulo,
  fechas,
  destacado,
}: {
  titulo: string;
  fechas: string[];
  destacado?: boolean;
}) {
  return (
    <div>
      <p className={destacado ? "text-sm font-medium text-gray-900" : "text-sm font-medium text-amber-900"}>
        {titulo}
      </p>
      <ul className="mt-1 space-y-0.5 text-sm text-amber-900">
        {recortar(fechas).map((linea) => (
          <li key={linea}>{linea}</li>
        ))}
      </ul>
    </div>
  );
}

// Cancelación al estilo Outlook: solo este turno, este y los siguientes, o toda
// la serie. Los tres alcances pasan por el mismo resumen y por el mismo popup de
// confirmación: elegir una opción no escribe nada, y lo único que escribe es
// confirmar adentro del popup.
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
  const [confirmando, setConfirmando] = useState(false);

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
  const hayQueCancelar = plan.cancelables.length > 0;

  // "Solo este turno" no aplica las protecciones, pero si el turno está
  // realizado, pagado o pasado conviene decirlo antes de que confirme: es la
  // información que hace falta para tomar la decisión.
  const avisoDelSolo = useMemo(() => {
    if (alcance !== "solo") {
      return null;
    }
    const esteTurno = serie.find((t) => t.id === actual.id);
    if (!esteTurno || esteTurno.estado === "cancelado") {
      return null;
    }
    const motivoProteccion = motivoDeProteccion(esteTurno, hoy);
    return motivoProteccion ? MOTIVO_EN_ORACION[motivoProteccion] : null;
  }, [alcance, serie, actual.id, hoy]);

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

      {abierto && (
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
            {/* Un solo botón para los tres alcances. No cancela: abre el
                resumen, y recién ahí se confirma. */}
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmando(true)}
              disabled={pending}
            >
              {pending ? "Cancelando…" : "Cancelar"}
            </Button>
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

      <AlertDialog
        open={confirmando}
        onOpenChange={(open) => {
          // Mientras la acción está corriendo el popup no se cierra: el
          // resultado es un redirect al calendario.
          if (!pending) {
            setConfirmando(open);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {elegida.titulo} · {diaYHora}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hayQueCancelar
                ? "Revisá el detalle antes de confirmar. Esto no se deshace solo."
                : razonSinCancelables(plan)}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-4">
            {hayQueCancelar && (
              <BloqueDeFechas
                destacado
                titulo={`Se ${plan.cancelables.length === 1 ? "cancela" : "cancelan"} ${turnos(plan.cancelables.length)}`}
                fechas={plan.cancelables.map((t) => formatearDiaCorto(t.fecha))}
              />
            )}

            {avisoDelSolo && (
              <p className="text-sm text-amber-900">
                Este turno {avisoDelSolo}. Se cancela igual porque lo elegiste puntualmente.
              </p>
            )}

            {plan.salteados.length > 0 && (
              <BloqueDeFechas
                titulo={`Se ${plan.salteados.length === 1 ? "saltea" : "saltean"} ${turnos(plan.salteados.length)}`}
                fechas={plan.salteados.map(
                  (s) => `${formatearDiaCorto(s.fecha)} — ${MOTIVO_LABELS[s.motivo]}`,
                )}
              />
            )}

            {plan.yaCancelados.length > 0 && (
              <BloqueDeFechas
                titulo={`${turnos(plan.yaCancelados.length)} ${plan.yaCancelados.length === 1 ? "ya estaba cancelado" : "ya estaban cancelados"}`}
                fechas={plan.yaCancelados.map((t) => formatearDiaCorto(t.fecha))}
              />
            )}
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <AlertDialogFooter>
            {hayQueCancelar ? (
              <>
                <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={enviar} disabled={pending}>
                  {pending ? "Cancelando…" : `Cancelar ${turnos(plan.cancelables.length)}`}
                </AlertDialogAction>
              </>
            ) : (
              // Sin nada para cancelar no hay acción que ofrecer: la salida es
              // cerrar, no un botón apagado que no explica nada.
              <AlertDialogCancel>Entendido</AlertDialogCancel>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
