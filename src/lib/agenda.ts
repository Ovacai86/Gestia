import type {
  DisponibilidadConFranjas,
  ExcepcionDisponibilidad,
  FranjaHoraria,
} from "@/types/disponibilidad";

// Las fechas del calendario se manejan como "YYYY-MM-DD" en calendario
// argentino. Para hacer aritmética se anclan a mediodía UTC: así sumar o
// restar días nunca cruza de día por el offset de -03:00.
function aDate(fecha: string): Date {
  return new Date(`${fecha}T12:00:00Z`);
}

export function sumarDias(fecha: string, dias: number): string {
  const d = aDate(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diaSemanaDe(fecha: string): number {
  return aDate(fecha).getUTCDay();
}

// Mismo criterio que balance/page.tsx: el día de hoy se define en calendario
// AR, no en la timezone del server (Vercel usa UTC).
export function hoyEnAR(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// La semana arranca el lunes.
export function inicioDeSemana(fecha: string): string {
  const diasDesdeLunes = (diaSemanaDe(fecha) + 6) % 7;
  return sumarDias(fecha, -diasDesdeLunes);
}

export function esFechaValida(fecha: string | undefined): fecha is string {
  return !!fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(aDate(fecha).getTime());
}

export function aMinutos(hora: string): number {
  const [h = 0, m = 0] = hora.split(":").map(Number);
  return h * 60 + m;
}

function aHora(minutos: number): string {
  const h = String(Math.floor(minutos / 60)).padStart(2, "0");
  const m = String(minutos % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// Los bloques no se encadenan: arrancan a la hora de inicio de la franja y se
// repiten cada 60 minutos, así cae uno por fila de la grilla. Lo que sobra de
// cada hora es el hueco entre turnos. Con 09:00–13:00 y bloques de 50' dan
// 09:00, 10:00, 11:00 y 12:00; el de las 13:00 no entra porque terminaría 13:50.
const PASO_MINUTOS = 60;

export type Bloque = {
  inicio: string;
  fin: string;
  // Filas de la grilla que ocupa. Con duraciones de más de una hora son varias.
  horas: number[];
};

// Los rangos bloqueados de un día puntual. Se pasan ya filtrados por fecha:
// generarBloques trabaja con horarios, no sabe de calendario.
type RangoBloqueado = { hora_inicio: string; hora_fin: string };

// Un bloque queda excluido si se solapa con un rango bloqueado, aunque sea
// parcialmente: media sesión adentro de las vacaciones no sirve.
function pisaExcepcion(inicio: number, fin: number, excepciones: RangoBloqueado[]): boolean {
  return excepciones.some((e) => aMinutos(e.hora_inicio) < fin && inicio < aMinutos(e.hora_fin));
}

export function generarBloques(
  franjas: FranjaHoraria[],
  duracion: number,
  excepciones: RangoBloqueado[] = [],
): Bloque[] {
  if (duracion <= 0) {
    return [];
  }

  // Un bloque más largo que una hora se comería el arranque del siguiente, así
  // que el paso se redondea a horas enteras: con 90' el paso pasa a ser 120'.
  const paso = Math.ceil(duracion / PASO_MINUTOS) * PASO_MINUTOS;
  const bloques: Bloque[] = [];

  for (const franja of franjas) {
    const inicio = aMinutos(franja.hora_inicio);
    const fin = aMinutos(franja.hora_fin);

    for (let minuto = inicio; minuto + duracion <= fin; minuto += paso) {
      const finBloque = minuto + duracion;

      if (pisaExcepcion(minuto, finBloque, excepciones)) {
        continue;
      }

      const primera = Math.floor(minuto / PASO_MINUTOS);
      // -1 para que un bloque que termina justo en punto no cuente esa hora.
      const ultima = Math.floor((finBloque - 1) / PASO_MINUTOS);

      bloques.push({
        inicio: aHora(minuto),
        fin: aHora(finBloque),
        horas: Array.from({ length: ultima - primera + 1 }, (_, i) => primera + i),
      });
    }
  }

  return bloques.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

// Los bloques que se pueden OFRECER para que los reserve un paciente, en una
// fecha concreta.
//
// Ojo con la diferencia: esto no es lo mismo que la grilla de /turnos. Ahí el
// profesional puede cargar un turno en cualquier horario, incluso fuera de su
// disponibilidad (queda marcado "Fuera de horario"). Acá no: lo que sale de
// esta función es lo único que se le puede llegar a mostrar a un paciente, así
// que nunca puede incluir un horario fuera de la disponibilidad configurada.
//
// La regla, entonces, es que se devuelve lista vacía si:
//   - no hay duración configurada,
//   - el día de la semana no está en disponibilidad,
//   - el día está en disponibilidad pero con activo = false,
//   - el día está activo pero sin franjas cargadas.
// Y si hay franjas, los bloques salen solo de adentro de esas franjas: un
// bloque que se pasaría del fin de la franja no se genera (lo garantiza la
// condición `minuto + duracion <= fin` de generarBloques).
export function bloquesOfrecibles(
  fecha: string,
  disponibilidades: DisponibilidadConFranjas[],
  duracion: number,
  excepciones: ExcepcionDisponibilidad[] = [],
): Bloque[] {
  if (duracion <= 0) {
    return [];
  }

  const delDia = disponibilidades.find((d) => d.dia_semana === diaSemanaDe(fecha));
  if (!delDia || !delDia.activo) {
    return [];
  }

  return generarBloques(delDia.franja_horaria ?? [], duracion, excepcionesDe(fecha, excepciones));
}

// Si un horario puntual se puede ofrecer o no. Es el mismo criterio que
// bloquesOfrecibles, pero para validar del lado del servidor lo que llegue de
// una reserva: nunca alcanza con que el front no lo haya mostrado.
export function esHorarioOfrecible(
  fecha: string,
  hora: string,
  disponibilidades: DisponibilidadConFranjas[],
  duracion: number,
  excepciones: ExcepcionDisponibilidad[] = [],
): boolean {
  return bloquesOfrecibles(fecha, disponibilidades, duracion, excepciones).some(
    (bloque) => bloque.inicio === hora,
  );
}

// Las excepciones que aplican a una fecha. Se filtra acá para que quien llame
// pueda traerse de una sola query las de todo el rango que está mostrando.
export function excepcionesDe(
  fecha: string,
  excepciones: ExcepcionDisponibilidad[],
): ExcepcionDisponibilidad[] {
  return excepciones.filter((e) => e.fecha === fecha);
}

// Si un "HH:MM" cae dentro de alguna franja de ese día. A diferencia de
// esHorarioOfrecible, no exige que arranque justo donde arranca un bloque: es
// para avisarle al profesional que un turno suyo quedó fuera de horario, no
// para decidir qué se le ofrece a un paciente.
export function caeEnDisponibilidad(
  fecha: string,
  hora: string,
  disponibilidades: DisponibilidadConFranjas[],
): boolean {
  const delDia = disponibilidades.find((d) => d.dia_semana === diaSemanaDe(fecha));
  if (!delDia || !delDia.activo) {
    return false;
  }

  const minuto = aMinutos(hora);
  return (delDia.franja_horaria ?? []).some(
    (f) => minuto >= aMinutos(f.hora_inicio) && minuto < aMinutos(f.hora_fin),
  );
}

// Un turno que tapa un bloque, ya leído en calendario AR.
export type TurnoOcupado = { fecha: string; hora: string; duracion_minutos: number };

// Cuántos días se miran hacia adelante buscando un bloque libre. Es un tope de
// seguridad: si no hay disponibilidad cargada o está todo ocupado, la búsqueda
// corta y el alta queda sin precargar, que es el comportamiento de antes.
export const DIAS_BUSQUEDA_BLOQUE = 60;

// Un bloque está tomado si algún turno se le solapa, o si algún turno arranca
// en una de las filas que el bloque ocupa. Lo segundo es lo que hace que la
// grilla muestre ese turno en la celda en vez de "Libre": sin esa condición se
// podría sugerir un horario que en el calendario se ve ocupado.
function bloqueTomado(bloque: Bloque, delDia: TurnoOcupado[]): boolean {
  const inicio = aMinutos(bloque.inicio);
  const fin = aMinutos(bloque.fin);

  return delDia.some((turno) => {
    const otroInicio = aMinutos(turno.hora);
    const otroFin = otroInicio + turno.duracion_minutos;
    return (otroInicio < fin && inicio < otroFin) || bloque.horas.includes(horaDe(turno.hora));
  });
}

// El primer bloque de la agenda que arranca de `desde` en adelante y no tiene
// ningún turno encima. Sirve para precargar el alta cuando se entra derecho a
// /turnos/nuevo, sin pasar por un bloque del calendario.
//
// La hora sale del bloque, no se redondea: los bloques arrancan donde arranca
// la franja y se repiten cada hora, así que con franjas en punto los horarios
// sugeridos caen siempre en punto.
export function primerBloqueLibre(
  desde: { fecha: string; hora: string },
  disponibilidades: DisponibilidadConFranjas[],
  duracion: number,
  excepciones: ExcepcionDisponibilidad[],
  ocupados: TurnoOcupado[],
): { fecha: string; hora: string } | null {
  if (duracion <= 0) {
    return null;
  }

  const porFecha = new Map<string, TurnoOcupado[]>();
  for (const turno of ocupados) {
    const delDia = porFecha.get(turno.fecha);
    if (delDia) {
      delDia.push(turno);
    } else {
      porFecha.set(turno.fecha, [turno]);
    }
  }

  for (let i = 0; i < DIAS_BUSQUEDA_BLOQUE; i++) {
    const fecha = sumarDias(desde.fecha, i);
    const delDia = porFecha.get(fecha) ?? [];

    for (const bloque of bloquesOfrecibles(fecha, disponibilidades, duracion, excepciones)) {
      // Hoy solo cuentan los bloques que todavía no arrancaron.
      if (i === 0 && bloque.inicio < desde.hora) {
        continue;
      }
      if (!bloqueTomado(bloque, delDia)) {
        return { fecha, hora: bloque.inicio };
      }
    }
  }

  return null;
}

// La fila de la grilla a la que pertenece un "HH:MM".
export function horaDe(hora: string): number {
  return Number(hora.slice(0, 2));
}

// turno.fecha_hora es timestamptz: para ubicarlo en la grilla hay que leerlo
// en calendario AR, no en la del server.
export function fechaHoraEnAR(iso: string): { fecha: string; hora: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;

  return {
    fecha: `${get("year")}-${get("month")}-${get("day")}`,
    hora: `${get("hour")}:${get("minute")}`,
  };
}

// Instante absoluto en que arranca un día del calendario AR.
export function inicioDelDiaISO(fecha: string): string {
  return new Date(`${fecha}T00:00:00-03:00`).toISOString();
}

function formatear(fecha: string, opciones: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", ...opciones }).format(aDate(fecha));
}

export function formatearRangoSemana(lunes: string, domingo: string): string {
  const desde = formatear(lunes, { day: "numeric", month: "long" });
  const hasta = formatear(domingo, { day: "numeric", month: "long", year: "numeric" });
  return `${desde} al ${hasta}`;
}

export function formatearDiaCorto(fecha: string): string {
  return formatear(fecha, { day: "numeric", month: "short" });
}

// "viernes 11 de septiembre", para listar una fecha suelta.
export function formatearDiaLargo(fecha: string): string {
  return formatear(fecha, { weekday: "long", day: "numeric", month: "long" });
}

export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

export function inicioDeMes(fecha: string): string {
  return `${mesDe(fecha)}-01`;
}

export function sumarMeses(fecha: string, meses: number): string {
  const d = aDate(inicioDeMes(fecha));
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

// Las semanas completas que cubren el mes, arrancando lunes. Las primeras y
// últimas celdas caen en el mes vecino, como en cualquier calendario.
export function semanasDelMes(fecha: string): string[][] {
  const primero = inicioDeMes(fecha);
  const ultimo = sumarDias(sumarMeses(primero, 1), -1);
  const ultimoLunes = inicioDeSemana(ultimo);
  const semanas: string[][] = [];

  for (let lunes = inicioDeSemana(primero); lunes <= ultimoLunes; lunes = sumarDias(lunes, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)));
  }
  return semanas;
}

export function formatearMes(fecha: string): string {
  return formatear(fecha, { month: "long", year: "numeric" });
}
