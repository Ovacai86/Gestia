import type { FranjaHoraria } from "@/types/disponibilidad";

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

function aMinutos(hora: string): number {
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

export function generarBloques(franjas: FranjaHoraria[], duracion: number): Bloque[] {
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
