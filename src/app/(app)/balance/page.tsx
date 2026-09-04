import { createClient } from "@/lib/supabase/server";
import { fechaHoraEnAR, formatearRangoSemana, semanasDelMes } from "@/lib/agenda";
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

function formatMonto(monto: number | null) {
  return currency.format(monto ?? 0);
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
  searchParams: Promise<{ mes?: string; anio?: string; paciente?: string; semana?: string }>;
}) {
  const {
    mes: mesParam,
    anio: anioParam,
    paciente: pacienteParam,
    semana: semanaParam,
  } = await searchParams;
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
  const [{ data: turnos }, { data: gastos }, { data: realizados }] = await Promise.all([
    supabase
      .from("turno")
      .select("*, paciente(nombre_apellido)")
      .eq("pagado", true)
      // Un turno cancelado no es ingreso, aunque haya quedado marcado como
      // pagado: la seña o el cobro previo se revisan a mano.
      .neq("estado", "cancelado")
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
    // El detalle de sesiones no mira el cobro: lista lo que se atendió. Es a
    // propósito distinto del total de ingresos, que suma por pagado.
    supabase
      .from("turno")
      .select("*, paciente(nombre_apellido)")
      .eq("estado", "realizado")
      .gte("fecha_hora", fechaHoraDesde)
      .lt("fecha_hora", fechaHoraHasta)
      .order("fecha_hora")
      .returns<TurnoConPaciente[]>(),
  ]);

  const listaTurnos = turnos ?? [];
  const listaGastos = gastos ?? [];
  // monto puede ser null (turno sin monto cargado): ahí suma cero.
  const ingresos = listaTurnos.reduce((acc, t) => acc + (t.monto ?? 0), 0);
  const egresos = listaGastos.reduce((acc, g) => acc + g.monto, 0);

  const anios = Array.from({ length: 6 }, (_, i) => defecto.anio - 4 + i);

  const sesiones = realizados ?? [];

  // Solo los pacientes que tienen alguna sesión en el período: un selector con
  // pacientes sin sesiones solo ofrecería filtros que no devuelven nada.
  const pacientesConSesiones = Array.from(
    new Map(
      sesiones
        .filter((t) => t.paciente)
        .map((t) => [t.paciente_id, t.paciente!.nombre_apellido]),
    ),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  // Las semanas que cubren el mes ya elegido arriba: el filtro acota adentro de
  // ese mes, no es un rango de fechas independiente.
  const semanas = semanasDelMes(fechaDesde).map((dias) => ({
    lunes: dias[0],
    domingo: dias[dias.length - 1],
  }));

  const pacienteFiltro = pacientesConSesiones.some(([id]) => id === pacienteParam)
    ? pacienteParam
    : undefined;
  const semanaFiltro = semanas.some((s) => s.lunes === semanaParam) ? semanaParam : undefined;
  const semanaElegida = semanas.find((s) => s.lunes === semanaFiltro);

  const sesionesFiltradas = sesiones.filter((turno) => {
    if (pacienteFiltro && turno.paciente_id !== pacienteFiltro) {
      return false;
    }
    if (semanaElegida) {
      const { fecha } = fechaHoraEnAR(turno.fecha_hora);
      return fecha >= semanaElegida.lunes && fecha <= semanaElegida.domingo;
    }
    return true;
  });

  const hayFiltros = !!pacienteFiltro || !!semanaFiltro;
  // Ojo: esto no es el total de ingresos de arriba. Suma lo realizado según los
  // filtros, cobrado o no; el de arriba suma lo cobrado de todo el mes.
  const subtotalFiltrado = sesionesFiltradas.reduce((acc, t) => acc + (t.monto ?? 0), 0);

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

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Total de ingresos</div>
          <div className="mt-1 text-2xl font-semibold text-green-600">{formatMonto(ingresos)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Total de egresos</div>
          <div className="mt-1 text-2xl font-semibold text-red-600">{formatMonto(egresos)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-medium text-gray-700">Sesiones realizadas</h2>

          {/* Los filtros viajan por querystring junto al período ya elegido, así
              que el mes y el año van como hidden para no perderlos. */}
          <form className="mb-3 flex flex-wrap items-center gap-2" method="get">
            <input type="hidden" name="mes" value={mes} />
            <input type="hidden" name="anio" value={anio} />
            <select
              name="paciente"
              defaultValue={pacienteFiltro ?? ""}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            >
              <option value="">Todos los pacientes</option>
              {pacientesConSesiones.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
            <select
              name="semana"
              defaultValue={semanaFiltro ?? ""}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            >
              <option value="">Todo el mes</option>
              {semanas.map((semana) => (
                <option key={semana.lunes} value={semana.lunes}>
                  {formatearRangoSemana(semana.lunes, semana.domingo)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Filtrar
            </button>
          </form>

          {sesionesFiltradas.length === 0 ? (
            <>
              <p className="text-gray-500">
                {hayFiltros
                  ? "No hay sesiones realizadas con estos filtros."
                  : "Sin sesiones realizadas en este período."}
              </p>
              <p className="mt-2 text-sm text-gray-700">
                Subtotal filtrado: <span className="font-medium">{formatMonto(0)}</span>
              </p>
            </>
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
                  {sesionesFiltradas.map((turno) => (
                    <tr key={turno.id}>
                      <td className="px-4 py-2 text-gray-600">
                        {new Date(turno.fecha_hora).toLocaleDateString("es-AR", { dateStyle: "short" })}
                      </td>
                      <td className="px-4 py-2 text-gray-900">{turno.paciente?.nombre_apellido ?? "—"}</td>
                      <td className="px-4 py-2 text-gray-600">
                        {formatMonto(turno.monto)}
                        {!turno.pagado && (
                          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            Sin cobrar
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {sesionesFiltradas.length > 0 && (
            <div className="mt-2">
              <p className="text-sm text-gray-700">
                Subtotal filtrado:{" "}
                <span className="font-medium">{formatMonto(subtotalFiltrado)}</span>
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                Suma lo realizado según estos filtros, cobrado o no. No es el total de ingresos de
                arriba, que cuenta lo cobrado de todo el mes.
              </p>
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
