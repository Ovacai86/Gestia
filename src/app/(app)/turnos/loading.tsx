import { Fragment } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

const HORAS = 8;

export default function TurnosLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Turnos</h1>
        <div className="flex items-center gap-4">
          <Link href="/turnos/configuracion" className="text-sm text-gray-600 hover:text-gray-900">
            Configurar disponibilidad
          </Link>
          <Link
            href="/turnos/nuevo"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Nuevo turno
          </Link>
        </div>
      </div>

      {/* Los controles son fijos; el rango de fechas depende de los datos. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-5 w-10" />
        <Skeleton className="h-5 w-56" />
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[48rem] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] gap-px rounded-lg border border-gray-200 bg-gray-200">
          <div className="bg-gray-50" />
          {Array.from({ length: 7 }).map((_, dia) => (
            <div key={dia} className="flex flex-col items-center gap-1 bg-white px-2 py-2">
              <Skeleton className="h-5 w-8" />
              <Skeleton className="h-4 w-4" />
            </div>
          ))}

          {Array.from({ length: HORAS }).map((_, hora) => (
            <Fragment key={hora}>
              <div className="flex justify-end bg-gray-50 px-2 py-2">
                <Skeleton className="h-4 w-10" />
              </div>
              {Array.from({ length: 7 }).map((_, dia) => (
                <div key={dia} className="bg-white p-1">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
