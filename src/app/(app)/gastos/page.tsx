import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Gasto } from "@/types/gasto";
import { eliminarGasto } from "./actions";

function formatFecha(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-AR", {
    dateStyle: "short",
  });
}

export default async function GastosPage() {
  const supabase = await createClient();
  const { data: gastos } = await supabase
    .from("gasto")
    .select("*")
    .order("fecha", { ascending: false })
    .returns<Gasto[]>();

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

      {!gastos || gastos.length === 0 ? (
        <p className="text-gray-500">Todavía no cargaste ningún gasto.</p>
      ) : (
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
              {gastos.map((gasto) => (
                <tr key={gasto.id}>
                  <td className="px-4 py-2">
                    <Link href={`/gastos/${gasto.id}`} className="text-gray-900 hover:underline">
                      {formatFecha(gasto.fecha)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      {gasto.categoria}
                    </span>
                  </td>
                  <td className="px-4 py-2 max-w-xs truncate text-gray-600">{gasto.descripcion ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-600">${gasto.monto}</td>
                  <td className="px-4 py-2 text-right">
                    <form action={eliminarGasto.bind(null, gasto.id)}>
                      <button type="submit" className="text-sm text-red-600 hover:underline">
                        Eliminar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
