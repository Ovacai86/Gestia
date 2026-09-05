import { Fragment } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { TurnoConPaciente, TurnoEstado } from "@/types/turno";
import type {
  ConfiguracionAgenda,
  DisponibilidadConFranjas,
  ExcepcionDisponibilidad,
} from "@/types/disponibilidad";
import { DIAS_SEMANA } from "@/types/disponibilidad";
import type { Bloque } from "@/lib/agenda";
import {
  diaSemanaDe,
  esFechaValida,
  fechaHoraEnAR,
  formatearMes,
  formatearRangoSemana,
  excepcionesDe,
  generarBloques,
  horaDe,
  hoyEnAR,
  inicioDeMes,
  inicioDeSemana,
  inicioDelDiaISO,
  mesDe,
  semanasDelMes,
  sumarDias,
  sumarMeses,
} from "@/lib/agenda";

const ESTADO_LABEL: Record<TurnoEstado, string> = {
  programado: "Programado",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

const ESTADO_CLASS: Record<TurnoEstado, string> = {
  programado: "bg-blue-100 text-blue-700",
  confirmado: "bg-purple-100 text-purple-700",
  realizado: "bg-green-100 text-green-700",
  cancelado: "bg-gray-100 text-gray-500",
};

// La grilla arranca el lunes; dia_semana sigue siendo 0 = domingo.
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];

type Vista = "semana" | "mes";

function claveCelda(fecha: string, hora: number) {
  return `${fecha}-${hora}`;
}

export default async function TurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; fecha?: string; dia?: string }>;
}) {
  const { vista: vistaParam, fecha: fechaParam, dia: diaParam } = await searchParams;

  const vista: Vista = vistaParam === "mes" ? "mes" : "semana";
  const hoy = hoyEnAR();
  const referencia = esFechaValida(fechaParam) ? fechaParam : hoy;
  const diaEnfocado = esFechaValida(diaParam) ? diaParam : null;

  // Las fechas visibles definen tanto la grilla como el rango que se consulta.
  const semanas = vista === "mes" ? semanasDelMes(referencia) : [];
  const fechasSemana =
    vista === "semana"
      ? Array.from({ length: 7 }, (_, i) => sumarDias(inicioDeSemana(referencia), i))
      : [];
  const visibles = vista === "mes" ? semanas.flat() : fechasSemana;
  const primera = visibles[0];
  const ultima = visibles[visibles.length - 1];

  const supabase = await createClient();
  const [
    { data: turnos },
    { data: disponibilidades },
    { data: configuracion },
    { data: excepciones },
  ] = await Promise.all([
    supabase
      .from("turno")
      .select("*, paciente(nombre_apellido)")
      .gte("fecha_hora", inicioDelDiaISO(primera))
      .lt("fecha_hora", inicioDelDiaISO(sumarDias(ultima, 1)))
      .order("fecha_hora")
      .returns<TurnoConPaciente[]>(),
    supabase
      .from("disponibilidad")
      .select("*, franja_horaria(*)")
      .eq("activo", true)
      .returns<DisponibilidadConFranjas[]>(),
    // Puede no haber fila: ahí la duración está sin configurar.
    supabase.from("configuracion_agenda").select("*").maybeSingle<ConfiguracionAgenda>(),
    // Las fechas bloqueadas que caen dentro de lo que se está mostrando.
    supabase
      .from("excepcion_disponibilidad")
      .select("*")
      .gte("fecha", visibles[0])
      .lte("fecha", visibles[visibles.length - 1])
      .returns<ExcepcionDisponibilidad[]>(),
  ]);

  const listaTurnos = turnos ?? [];
  const activas = disponibilidades ?? [];
  const listaExcepciones = excepciones ?? [];
  // Una sola duración para toda la agenda. Sin configurar vale 0, y con 0
  // generarBloques no devuelve ningún bloque.
  const duracionBloque = configuracion?.duracion_bloque_minutos ?? 0;

  const diaHabilitado = (fecha: string) =>
    activas.some((d) => d.dia_semana === diaSemanaDe(fecha));

  const turnosPorDia = new Map<string, TurnoConPaciente[]>();
  const turnosPorCelda = new Map<string, TurnoConPaciente[]>();
  for (const turno of listaTurnos) {
    const { fecha, hora } = fechaHoraEnAR(turno.fecha_hora);
    const delDia = turnosPorDia.get(fecha);
    if (delDia) {
      delDia.push(turno);
    } else {
      turnosPorDia.set(fecha, [turno]);
    }

    const clave = claveCelda(fecha, horaDe(hora));
    const deLaCelda = turnosPorCelda.get(clave);
    if (deLaCelda) {
      deLaCelda.push(turno);
    } else {
      turnosPorCelda.set(clave, [turno]);
    }
  }

  // Cada día arma sus bloques con sus propias franjas, pero todos con la misma
  // duración. Un bloque más largo que una hora ocupa varias filas: solo la
  // primera es clickeable, las siguientes son continuación.
  const columnas = fechasSemana.map((fecha) => {
    const disponibilidad = activas.find((d) => d.dia_semana === diaSemanaDe(fecha));
    const porHora = new Map<number, { bloque: Bloque; esInicio: boolean }>();

    if (disponibilidad) {
      const bloques = generarBloques(
        disponibilidad.franja_horaria ?? [],
        duracionBloque,
        excepcionesDe(fecha, listaExcepciones),
      );
      for (const bloque of bloques) {
        bloque.horas.forEach((hora, i) => porHora.set(hora, { bloque, esInicio: i === 0 }));
      }
    }

    return {
      fecha,
      habilitado: !!disponibilidad,
      duracion: duracionBloque,
      porHora,
    };
  });

  // El alto de la grilla cubre la franja más amplia de la semana y además
  // cualquier turno que caiga fuera, para que ninguno quede escondido.
  const horasUsadas = new Set<number>();
  for (const columna of columnas) {
    for (const hora of columna.porHora.keys()) {
      horasUsadas.add(hora);
    }
  }
  for (const turno of listaTurnos) {
    horasUsadas.add(horaDe(fechaHoraEnAR(turno.fecha_hora).hora));
  }
  const desdeHora = horasUsadas.size > 0 ? Math.min(...horasUsadas) : 0;
  const hastaHora = horasUsadas.size > 0 ? Math.max(...horasUsadas) : 0;
  const horas =
    horasUsadas.size > 0
      ? Array.from({ length: hastaHora - desdeHora + 1 }, (_, i) => desdeHora + i)
      : [];

  const anterior =
    vista === "mes" ? sumarMeses(referencia, -1) : sumarDias(inicioDeSemana(referencia), -7);
  const siguiente =
    vista === "mes" ? sumarMeses(referencia, 1) : sumarDias(inicioDeSemana(referencia), 7);

  const linkVista = (v: Vista) => `/turnos?vista=${v}&fecha=${referencia}`;
  const linkNavegacion = (fecha: string) => `/turnos?vista=${vista}&fecha=${fecha}`;

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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5">
          {(["semana", "mes"] as const).map((v) => (
            <Link
              key={v}
              href={linkVista(v)}
              className={`rounded px-3 py-1 text-sm capitalize ${
                vista === v ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {v}
            </Link>
          ))}
        </div>

        <Link
          href={linkNavegacion(anterior)}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← Anterior
        </Link>
        <Link
          href={linkNavegacion(siguiente)}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Siguiente →
        </Link>
        <Link href={`/turnos?vista=${vista}`} className="text-sm text-gray-600 hover:text-gray-900">
          Hoy
        </Link>

        <span className="text-sm text-gray-500">
          {vista === "mes"
            ? formatearMes(referencia)
            : formatearRangoSemana(fechasSemana[0], fechasSemana[6])}
        </span>
      </div>

      {activas.length === 0 && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
          <p className="font-medium text-gray-900">Todavía no configuraste tu disponibilidad</p>
          <p className="mt-1 text-sm text-gray-500">
            Sin días de atención cargados, la agenda no puede marcar qué horarios ofrecés.
          </p>
          <Link
            href="/turnos/configuracion"
            className="mt-3 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Configurar disponibilidad
          </Link>
        </div>
      )}

      {vista === "semana" ? (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[48rem] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] gap-px rounded-lg border border-gray-200 bg-gray-200">
            <div className="bg-gray-50" />
            {columnas.map(({ fecha, habilitado }) => (
              <div
                key={fecha}
                className={`px-2 py-2 text-center ${
                  habilitado ? "bg-white" : "bg-gray-50"
                } ${fecha === diaEnfocado ? "ring-2 ring-inset ring-gray-900" : ""}`}
              >
                <div
                  className={`text-sm font-medium ${
                    habilitado ? "text-gray-900" : "text-gray-400"
                  }`}
                >
                  {DIAS_SEMANA[diaSemanaDe(fecha)].slice(0, 3)}
                </div>
                <div
                  className={`text-xs ${
                    fecha === hoy
                      ? "font-medium text-gray-900"
                      : habilitado
                        ? "text-gray-500"
                        : "text-gray-400"
                  }`}
                >
                  {Number(fecha.slice(8, 10))}
                </div>
              </div>
            ))}

            {horas.length === 0 ? (
              <div className="col-span-8 bg-white p-6 text-center text-sm text-gray-500">
                No hay horarios para mostrar en esta semana.
              </div>
            ) : (
              horas.map((hora) => (
                <Fragment key={hora}>
                  <div className="bg-gray-50 px-2 py-2 text-right text-xs text-gray-500">
                    {String(hora).padStart(2, "0")}:00
                  </div>
                  {columnas.map(({ fecha, duracion, porHora }) => {
                    const celda = porHora.get(hora);
                    const bloque = celda?.bloque;
                    const deLaCelda = turnosPorCelda.get(claveCelda(fecha, hora)) ?? [];
                    const enfocado = fecha === diaEnfocado;

                    if (deLaCelda.length > 0) {
                      return (
                        <div
                          key={fecha}
                          className={`space-y-1 p-1 ${bloque ? "bg-white" : "bg-gray-50"} ${
                            enfocado ? "ring-2 ring-inset ring-gray-900" : ""
                          }`}
                        >
                          {deLaCelda.map((turno) => (
                            <Link
                              key={turno.id}
                              href={`/turnos/${turno.id}`}
                              className="block rounded border border-gray-200 bg-white px-2 py-1 hover:border-gray-400"
                            >
                              {/* El "$" del cobrado va en la misma fila que la
                                  hora, pegado al borde derecho del bloque. */}
                              <div className="flex items-baseline justify-between gap-1 text-xs text-gray-500">
                                <span>{fechaHoraEnAR(turno.fecha_hora).hora}</span>
                                {turno.pagado && (
                                  <span
                                    className="font-medium text-green-600"
                                    title="Pagado"
                                    aria-label="Pagado"
                                  >
                                    $
                                  </span>
                                )}
                              </div>
                              <div className="truncate text-sm font-medium text-gray-900">
                                {turno.paciente?.nombre_apellido ?? "—"}
                              </div>
                              <span
                                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${ESTADO_CLASS[turno.estado]}`}
                              >
                                {ESTADO_LABEL[turno.estado]}
                              </span>
                              {/* Turno cargado fuera de la franja de ese día. */}
                              {!bloque && (
                                <div className="mt-1 text-xs text-amber-600">Fuera de horario</div>
                              )}
                            </Link>
                          ))}
                        </div>
                      );
                    }

                    if (bloque && celda?.esInicio) {
                      return (
                        <Link
                          key={fecha}
                          href={`/turnos/nuevo?fecha_hora=${fecha}T${bloque.inicio}&duracion=${duracion}`}
                          className={`block bg-white p-1 hover:bg-gray-50 ${
                            enfocado ? "ring-2 ring-inset ring-gray-900" : ""
                          }`}
                        >
                          <div className="rounded border border-dashed border-gray-200 px-2 py-1">
                            <div className="text-xs text-gray-500">
                              {bloque.inicio}
                              {bloque.horas.length > 1 && ` – ${bloque.fin}`}
                            </div>
                            <div className="text-sm text-gray-400">Libre</div>
                          </div>
                        </Link>
                      );
                    }

                    // Continuación de un bloque que arrancó en una fila de
                    // arriba: no se ofrece de nuevo, pero tampoco va grisada.
                    if (bloque) {
                      return (
                        <div
                          key={fecha}
                          className={`bg-white ${
                            enfocado ? "ring-2 ring-inset ring-gray-900" : ""
                          }`}
                        />
                      );
                    }

                    return (
                      <div
                        key={fecha}
                        className={`bg-gray-50 ${
                          enfocado ? "ring-2 ring-inset ring-gray-900" : ""
                        }`}
                      />
                    );
                  })}
                </Fragment>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[48rem] grid-cols-7 gap-px rounded-lg border border-gray-200 bg-gray-200">
            {ORDEN_SEMANA.map((dow) => (
              <div
                key={dow}
                className="bg-gray-50 px-2 py-2 text-center text-xs font-medium text-gray-600"
              >
                {DIAS_SEMANA[dow].slice(0, 3)}
              </div>
            ))}

            {semanas.flat().map((fecha) => {
              const habilitado = diaHabilitado(fecha);
              const delMes = mesDe(fecha) === mesDe(inicioDeMes(referencia));
              const delDia = turnosPorDia.get(fecha) ?? [];

              return (
                <Link
                  key={fecha}
                  href={`/turnos?vista=semana&fecha=${fecha}&dia=${fecha}`}
                  className={`min-h-24 p-2 hover:bg-gray-50 ${
                    habilitado ? "bg-white" : "bg-gray-50"
                  }`}
                >
                  <div
                    className={`text-xs ${
                      fecha === hoy
                        ? "inline-flex size-5 items-center justify-center rounded-full bg-gray-900 font-medium text-white"
                        : delMes
                          ? habilitado
                            ? "text-gray-900"
                            : "text-gray-400"
                          : "text-gray-300"
                    }`}
                  >
                    {Number(fecha.slice(8, 10))}
                  </div>

                  <div className="mt-1 space-y-0.5">
                    {delDia.slice(0, 3).map((turno) => (
                      <div
                        key={turno.id}
                        className={`truncate rounded px-1 py-0.5 text-xs ${ESTADO_CLASS[turno.estado]}`}
                      >
                        {turno.paciente?.nombre_apellido ?? "—"}
                      </div>
                    ))}
                    {delDia.length > 3 && (
                      <div className="px-1 text-xs text-gray-500">+{delDia.length - 3}</div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
