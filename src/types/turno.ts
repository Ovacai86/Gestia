export type TurnoEstado = "programado" | "confirmado" | "realizado" | "cancelado";

export type TurnoOrigen = "profesional" | "paciente";

export type Turno = {
  id: string;
  paciente_id: string;
  fecha_hora: string;
  duracion_minutos: number;
  estado: TurnoEstado;
  // Puede quedar sin cargar: el paciente no tiene monto por sesión definido.
  monto: number | null;
  pagado: boolean;
  motivo_cancelacion: string | null;
  origen: TurnoOrigen;
  aceptado_por_profesional: boolean;
  user_id: string;
};

export type TurnoConPaciente = Turno & {
  paciente: { nombre_apellido: string } | null;
};
