import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { DIAS_SEMANA } from "@/types/disponibilidad";

export default function ConfiguracionAgendaLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Disponibilidad</h1>
        <Link href="/turnos" className="text-sm text-gray-600 hover:text-gray-900">
          Volver a turnos
        </Link>
      </div>

      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h2 className="mb-2 text-sm font-medium text-gray-700">Días de atención</h2>
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {/* Los nombres de los días son fijos, así que van como texto real:
                lo único que se sabe recién con los datos es si el día está
                activo, con qué franjas y con qué duración. Las filas se dibujan
                con el alto del día apagado, que es el caso más común. */}
            {DIAS_SEMANA.map((nombre) => (
              <div key={nombre} className="flex flex-wrap items-start gap-x-6 gap-y-3 px-4 py-3">
                <div className="flex w-40 shrink-0 items-center gap-3 pt-1">
                  <Skeleton className="h-[18px] w-8 rounded-full" />
                  <span className="text-sm text-gray-900">{nombre}</span>
                </div>
                <Skeleton className="mt-2 h-5 w-24" />
              </div>
            ))}
          </div>
        </div>

        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}
