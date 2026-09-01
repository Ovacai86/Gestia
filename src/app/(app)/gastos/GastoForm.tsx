"use client";

import { useActionState } from "react";
import type { GastoFormState } from "./actions";
import type { Gasto } from "@/types/gasto";
import { GASTO_CATEGORIAS } from "@/types/gasto";

export function GastoForm({
  action,
  gasto,
}: {
  action: (state: GastoFormState, formData: FormData) => Promise<GastoFormState>;
  gasto?: Gasto;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="fecha" className="text-sm font-medium text-gray-700">
            Fecha *
          </label>
          <input
            id="fecha"
            name="fecha"
            type="date"
            required
            defaultValue={gasto?.fecha ?? ""}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="monto" className="text-sm font-medium text-gray-700">
            Monto *
          </label>
          <input
            id="monto"
            name="monto"
            type="number"
            min={0.01}
            step="0.01"
            required
            defaultValue={gasto?.monto ?? ""}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="categoria" className="text-sm font-medium text-gray-700">
          Categoría *
        </label>
        <select
          id="categoria"
          name="categoria"
          required
          defaultValue={gasto?.categoria ?? ""}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        >
          <option value="" disabled>
            Seleccioná una categoría
          </option>
          {GASTO_CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="descripcion" className="text-sm font-medium text-gray-700">
          Descripción
        </label>
        <textarea
          id="descripcion"
          name="descripcion"
          rows={3}
          defaultValue={gasto?.descripcion ?? ""}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>

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
