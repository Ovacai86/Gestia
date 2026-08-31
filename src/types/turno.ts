export type TurnoEstado = "programado" | "confirmado" | "realizado" | "cancelado";

export type Turno = {
  id: string;
  paciente_id: string;
  fecha_hora: string;
  duracion_minutos: number;
  estado: TurnoEstado;
  monto: number;
  pagado: boolean;
  motivo_cancelacion: string | null;
  user_id: string;
};

export type TurnoConPaciente = Turno & {
  paciente: { nombre_apellido: string } | null;
};
