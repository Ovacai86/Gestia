import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ConfiguracionAgenda, DisponibilidadConFranjas } from "@/types/disponibilidad";
import { ConfiguracionForm } from "./ConfiguracionForm";
import { guardarAgenda } from "./actions";

export default async function ConfiguracionAgendaPage() {
  const supabase = await createClient();
  const [{ data: disponibilidades }, { data: configuracion }] = await Promise.all([
    supabase
      .from("disponibilidad")
      .select("*, franja_horaria(*)")
      .order("dia_semana")
      .returns<DisponibilidadConFranjas[]>(),
    // Puede no haber fila: ahí la duración queda sin configurar.
    supabase
      .from("configuracion_agenda")
      .select("*")
      .maybeSingle<ConfiguracionAgenda>(),
  ]);

  const sinConfigurar = (disponibilidades?.length ?? 0) === 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Disponibilidad</h1>
        <Link href="/turnos" className="text-sm text-gray-600 hover:text-gray-900">
          Volver a turnos
        </Link>
      </div>

      {sinConfigurar && (
        <div className="mx-auto mb-6 max-w-2xl rounded-lg border border-gray-200 bg-white p-4">
          <p className="font-medium text-gray-900">Todavía no configuraste tu disponibilidad</p>
          <p className="mt-1 text-sm text-gray-500">
            Activá los días que atendés, cargá una o más franjas por día y elegí cuánto dura un
            bloque. Con eso la agenda va a poder calcular los turnos disponibles.
          </p>
        </div>
      )}

      <ConfiguracionForm
        action={guardarAgenda}
        disponibilidades={disponibilidades ?? []}
        configuracion={configuracion ?? null}
      />
    </div>
  );
}
