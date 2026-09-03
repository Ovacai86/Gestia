import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

const FILAS = 5;

export default function GastosLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Gastos</h1>
        <Link
          href="/gastos/nuevo"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Nuevo gasto
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Categoría</th>
              <th className="px-4 py-2 font-medium">Descripción</th>
              <th className="px-4 py-2 font-medium">Monto</th>
              <th className="px-4 py-2" />
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
                  <Skeleton className="h-5 w-48" />
                </td>
                <td className="px-4 py-2">
                  <Skeleton className="h-5 w-16" />
                </td>
                <td className="px-4 py-2">
                  <Skeleton className="ml-auto h-5 w-16" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
