import { Skeleton } from "@/components/ui/skeleton";

const FILAS = 4;

export default function BalanceLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Balance</h1>
        {/* Los selects de mes/año dependen del período elegido, así que van
            como placeholder con el mismo alto que los controles reales. */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-16" />
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Total de ingresos</div>
          <Skeleton className="mt-1 h-8 w-32" />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Total de egresos</div>
          <Skeleton className="mt-1 h-8 w-32" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-medium text-gray-700">Turnos pagados</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Paciente</th>
                  <th className="px-4 py-2 font-medium">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from({ length: FILAS }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2">
                      <Skeleton className="h-5 w-20" />
                    </td>
                    <td className="px-4 py-2">
                      <Skeleton className="h-5 w-32" />
                    </td>
                    <td className="px-4 py-2">
                      <Skeleton className="h-5 w-20" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium text-gray-700">Gastos</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Categoría</th>
                  <th className="px-4 py-2 font-medium">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from({ length: FILAS }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2">
                      <Skeleton className="h-5 w-20" />
                    </td>
                    <td className="px-4 py-2">
                      <Skeleton className="h-5 w-24 rounded-full" />
                    </td>
                    <td className="px-4 py-2">
                      <Skeleton className="h-5 w-20" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
