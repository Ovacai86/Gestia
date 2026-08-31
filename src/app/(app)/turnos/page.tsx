import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { TurnoConPaciente, TurnoEstado } from "@/types/turno";
import { eliminarTurno } from "./actions";

const ESTADO_LABEL: Record<TurnoEstado, string> = {
  programado: "Programado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

const ESTADO_CLASS: Record<TurnoEstado, string> = {
  programado: "bg-blue-100 text-blue-700",
  realizado: "bg-green-100 text-green-700",
  cancelado: "bg-gray-100 text-gray-500",
};

function formatFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

type GrupoPaciente = {
  pacienteId: string;
  nombre: string;
  turnos: TurnoConPaciente[];
};

function agruparPorPaciente(turnos: TurnoConPaciente[]): GrupoPaciente[] {
  const grupos = new Map<string, GrupoPaciente>();

  for (const turno of turnos) {
    const grupo = grupos.get(turno.paciente_id);
    if (grupo) {
      grupo.turnos.push(turno);
    } else {
      grupos.set(turno.paciente_id, {
        pacienteId: turno.paciente_id,
        nombre: turno.paciente?.nombre_apellido ?? "—",
        turnos: [turno],
      });
    }
  }

  return Array.from(grupos.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export default async function TurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ paciente?: string }>;
}) {
  const { paciente: pacienteSeleccionado } = await searchParams;

  const supabase = await createClient();
  const { data: turnos } = await supabase
    .from("turno")
    .select("*, paciente(nombre_apellido)")
    .order("fecha_hora", { ascending: false })
    .returns<TurnoConPaciente[]>();

  const grupos = agruparPorPaciente(turnos ?? []);
  const idActivo = pacienteSeleccionado ?? grupos[0]?.pacienteId;
  const grupoActivo = grupos.find((g) => g.pacienteId === idActivo);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Turnos</h1>
        <Link
          href="/turnos/nuevo"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Nuevo turno
        </Link>
      </div>

      {grupos.length === 0 ? (
        <p className="text-gray-500">Todavía no cargaste ningún turno.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
          <div className="space-y-1">
            {grupos.map((grupo) => (
              <Link
                key={grupo.pacienteId}
                href={`/turnos?paciente=${grupo.pacienteId}`}
                className={`block rounded-md px-3 py-2 text-sm ${
                  grupo.pacienteId === idActivo
                    ? "bg-gray-900 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <div className="font-medium">{grupo.nombre}</div>
                <div className={grupo.pacienteId === idActivo ? "text-gray-300" : "text-gray-400"}>
                  {grupo.turnos.length} turno{grupo.turnos.length === 1 ? "" : "s"}
                </div>
              </Link>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            {!grupoActivo ? (
              <p className="p-4 text-gray-500">Seleccioná un paciente.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2 font-medium">Monto</th>
                    <th className="px-4 py-2 font-medium">Pagado</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {grupoActivo.turnos.map((turno) => (
                    <tr key={turno.id}>
                      <td className="px-4 py-2">
                        <Link href={`/turnos/${turno.id}`} className="text-gray-900 hover:underline">
                          {formatFechaHora(turno.fecha_hora)}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_CLASS[turno.estado]}`}>
                          {ESTADO_LABEL[turno.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-600">${turno.monto}</td>
                      <td className="px-4 py-2 text-gray-600">{turno.pagado ? "Sí" : "No"}</td>
                      <td className="px-4 py-2 text-right">
                        <form action={eliminarTurno.bind(null, turno.id)}>
                          <button type="submit" className="text-sm text-red-600 hover:underline">
                            Eliminar
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
