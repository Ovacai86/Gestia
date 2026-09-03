// El índice del array coincide con disponibilidad.dia_semana (0 = domingo).
export const DIAS_SEMANA = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

// Franja que se propone al activar un día que todavía no tiene ninguna.
export const HORARIO_POR_DEFECTO = { inicio: "09:00", fin: "17:00" } as const;

// Un tramo de atención dentro de un día. Son varios por día para soportar el
// día partido (ej. de 09:00 a 11:00 y de 14:00 a 18:00).
export type FranjaHoraria = {
  id: string;
  disponibilidad_id: string;
  // Formato "HH:MM:SS" como lo devuelve Postgres para el tipo time.
  hora_inicio: string;
  hora_fin: string;
  user_id: string;
};

export type Disponibilidad = {
  id: string;
  dia_semana: number;
  activo: boolean;
  user_id: string;
};

export type DisponibilidadConFranjas = Disponibilidad & {
  franja_horaria: FranjaHoraria[];
};

// La duración del bloque es una sola para toda la agenda. Mientras no haya
// fila, la duración está sin configurar: el campo se muestra vacío y la agenda
// no ofrece ningún bloque.
export type ConfiguracionAgenda = {
  id: string;
  duracion_bloque_minutos: number;
  user_id: string;
};
