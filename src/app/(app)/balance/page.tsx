import { createClient } from "@/lib/supabase/server";
import type { Gasto } from "@/types/gasto";
import type { TurnoConPaciente } from "@/types/turno";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function formatMonto(monto: number) {
  return currency.format(monto);
}

// El período se define en calendario AR (-03:00), no en la timezone del
// servidor (Vercel usa UTC) — mismo motivo que en turnos/actions.ts.
function hoyEnAR() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { anio: Number(get("year")), mes: Number(get("month")) };
}

function siguiente(anio: number, mes: number) {
  return mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default async function BalancePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; anio?: string }>;
}) {
  const { mes: mesParam, anio: anioParam } = await searchParams;
  const defecto = hoyEnAR();

  const mesNum = Number(mesParam);
  const anioNum = Number(anioParam);
  const mes = mesNum >= 1 && mesNum <= 12 ? mesNum : defecto.mes;
  const anio = anioNum >= 2000 && anioNum <= 2100 ? anioNum : defecto.anio;
  const { anio: anioSiguiente, mes: mesSiguiente } = siguiente(anio, mes);

  // turno.fecha_hora es timestamptz: el rango se ancla a medianoche AR.
  const fechaHoraDesde = new Date(`${anio}-${pad(mes)}-01T00:00:00-03:00`).toISOString();
  const fechaHoraHasta = new Date(`${anioSiguiente}-${pad(mesSiguiente)}-01T00:00:00-03:00`).toISOString();

  // gasto.fecha es date (sin hora): se compara directo contra el calendario.
  const fechaDesde = `${anio}-${pad(mes)}-01`;
  const fechaHasta = `${anioSiguiente}-${pad(mesSiguiente)}-01`;

  const supabase = await createClient();
  const [{ data: turnos }, { data: gastos }] = await Promise.all([
    supabase
      .from("turno")
      .select("*, paciente(nombre_apellido)")
      .eq("pagado", true)
      .gte("fecha_hora", fechaHoraDesde)
      .lt("fecha_hora", fechaHoraHasta)
      .order("fecha_hora")
      .returns<TurnoConPaciente[]>(),
    supabase
      .from("gasto")
      .select("*")
      .gte("fecha", fechaDesde)
      .lt("fecha", fechaHasta)
      .order("fecha")
      .returns<Gasto[]>(),
  ]);

  const listaTurnos = turnos ?? [];
  const listaGastos = gastos ?? [];
  const ingresos = listaTurnos.reduce((acc, t) => acc + t.monto, 0);
  const egresos = listaGastos.reduce((acc, g) => acc + g.monto, 0);
  const balance = ingresos - egresos;

  const anios = Array.from({ length: 6 }, (_, i) => defecto.anio - 4 + i);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Balance</h1>
        <form className="flex items-center gap-2" method="get">
          <select
            name="mes"
            defaultValue={mes}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          >
            {MESES.map((nombre, i) => (
              <option key={nombre} value={i + 1}>
                {nombre}
              </option>
            ))}
          </select>
          <select
            name="anio"
            defaultValue={anio}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          >
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Ver
          </button>
        </form>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Ingresos</div>
          <div className="mt-1 text-2xl font-semibold text-green-600">{formatMonto(ingresos)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Gastos</div>
          <div className="mt-1 text-2xl font-semibold text-red-600">{formatMonto(egresos)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Balance</div>
          <div className={`mt-1 text-2xl font-semibold ${balance >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatMonto(balance)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-medium text-gray-700">Turnos pagados</h2>
          {listaTurnos.length === 0 ? (
            <p className="text-gray-500">Sin ingresos registrados en este período.</p>
          ) : (
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
                  {listaTurnos.map((turno) => (
                    <tr key={turno.id}>
                      <td className="px-4 py-2 text-gray-600">
                        {new Date(turno.fecha_hora).toLocaleDateString("es-AR", { dateStyle: "short" })}
                      </td>
                      <td className="px-4 py-2 text-gray-900">{turno.paciente?.nombre_apellido ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-600">{formatMonto(turno.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium text-gray-700">Gastos</h2>
          {listaGastos.length === 0 ? (
            <p className="text-gray-500">Sin gastos registrados en este período.</p>
          ) : (
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
                  {listaGastos.map((gasto) => (
                    <tr key={gasto.id}>
                      <td className="px-4 py-2 text-gray-600">
                        {new Date(`${gasto.fecha}T00:00:00`).toLocaleDateString("es-AR", { dateStyle: "short" })}
                      </td>
                      <td className="px-4 py-2">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                          {gasto.categoria}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{formatMonto(gasto.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
