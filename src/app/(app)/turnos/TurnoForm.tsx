"use client";

import { useActionState, useState } from "react";
import type { TurnoFormState } from "./actions";
import type { Turno, TurnoEstado } from "@/types/turno";

type PacienteOption = { id: string; nombre_apellido: string };

// Mismo motivo que en actions.ts: forzamos AR (-03:00) en vez de usar la
// timezone local del proceso que renderiza (server en SSR vs. browser).
function toDatetimeLocalValue(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function TurnoForm({
  action,
  pacientes,
  turno,
}: {
  action: (state: TurnoFormState, formData: FormData) => Promise<TurnoFormState>;
  pacientes: PacienteOption[];
  turno?: Turno;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [estado, setEstado] = useState<TurnoEstado>(turno?.estado ?? "programado");

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <div className="space-y-1">
        <label htmlFor="paciente_id" className="text-sm font-medium text-gray-700">
          Paciente *
        </label>
        <select
          id="paciente_id"
          name="paciente_id"
          required
          defaultValue={turno?.paciente_id ?? ""}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        >
          <option value="" disabled>
            Seleccioná un paciente
          </option>
          {pacientes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre_apellido}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="fecha_hora" className="text-sm font-medium text-gray-700">
            Fecha y hora *
          </label>
          <input
            id="fecha_hora"
            name="fecha_hora"
            type="datetime-local"
            required
            defaultValue={turno ? toDatetimeLocalValue(turno.fecha_hora) : ""}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="duracion_minutos" className="text-sm font-medium text-gray-700">
            Duración (min)
          </label>
          <input
            id="duracion_minutos"
            name="duracion_minutos"
            type="number"
            min={0}
            defaultValue={turno?.duracion_minutos ?? 50}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="estado" className="text-sm font-medium text-gray-700">
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as TurnoEstado)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          >
            <option value="programado">Programado</option>
            <option value="confirmado">Confirmado</option>
            <option value="realizado">Realizado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="monto" className="text-sm font-medium text-gray-700">
            Monto
          </label>
          <input
            id="monto"
            name="monto"
            type="number"
            min={0}
            step="0.01"
            defaultValue={turno?.monto ?? ""}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
      </div>

      {estado === "cancelado" && (
        <div className="space-y-1">
          <label htmlFor="motivo_cancelacion" className="text-sm font-medium text-gray-700">
            Motivo de cancelación
          </label>
          <textarea
            id="motivo_cancelacion"
            name="motivo_cancelacion"
            rows={2}
            defaultValue={turno?.motivo_cancelacion ?? ""}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" name="pagado" defaultChecked={turno?.pagado ?? false} />
        Pagado
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
