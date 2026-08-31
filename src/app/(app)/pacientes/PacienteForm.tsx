"use client";

import { useActionState } from "react";
import type { PacienteFormState } from "./actions";
import type { Paciente } from "@/types/paciente";

export function PacienteForm({
  action,
  paciente,
}: {
  action: (state: PacienteFormState, formData: FormData) => Promise<PacienteFormState>;
  paciente?: Paciente;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <div className="space-y-1">
        <label htmlFor="nombre_apellido" className="text-sm font-medium text-gray-700">
          Nombre y apellido *
        </label>
        <input
          id="nombre_apellido"
          name="nombre_apellido"
          required
          defaultValue={paciente?.nombre_apellido}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="dni" className="text-sm font-medium text-gray-700">
            DNI
          </label>
          <input
            id="dni"
            name="dni"
            defaultValue={paciente?.dni ?? ""}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="telefono" className="text-sm font-medium text-gray-700">
            Teléfono
          </label>
          <input
            id="telefono"
            name="telefono"
            defaultValue={paciente?.telefono ?? ""}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={paciente?.email ?? ""}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="obra_social" className="text-sm font-medium text-gray-700">
          Obra social
        </label>
        <input
          id="obra_social"
          name="obra_social"
          defaultValue={paciente?.obra_social ?? ""}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="notas" className="text-sm font-medium text-gray-700">
          Notas
        </label>
        <textarea
          id="notas"
          name="notas"
          rows={3}
          defaultValue={paciente?.notas ?? ""}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" name="activo" defaultChecked={paciente?.activo ?? true} />
        Activo
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
