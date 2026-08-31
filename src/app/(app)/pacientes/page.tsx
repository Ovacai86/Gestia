import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Paciente } from "@/types/paciente";
import { eliminarPaciente } from "./actions";

export default async function PacientesPage() {
  const supabase = await createClient();
  const { data: pacientes } = await supabase
    .from("paciente")
    .select("*")
    .order("nombre_apellido")
    .returns<Paciente[]>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Pacientes</h1>
        <Link
          href="/pacientes/nuevo"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Nuevo paciente
        </Link>
      </div>

      {!pacientes || pacientes.length === 0 ? (
        <p className="text-gray-500">Todavía no cargaste ningún paciente.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Teléfono</th>
                <th className="px-4 py-2 font-medium">Obra social</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pacientes.map((paciente) => (
                <tr key={paciente.id}>
                  <td className="px-4 py-2">
                    <Link href={`/pacientes/${paciente.id}`} className="text-gray-900 hover:underline">
                      {paciente.nombre_apellido}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{paciente.telefono || "—"}</td>
                  <td className="px-4 py-2 text-gray-600">{paciente.obra_social || "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        paciente.activo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {paciente.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action={eliminarPaciente.bind(null, paciente.id)}>
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
