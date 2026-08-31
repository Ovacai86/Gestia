export type Paciente = {
  id: string;
  nombre_apellido: string;
  dni: string | null;
  telefono: string | null;
  email: string | null;
  obra_social: string | null;
  notas: string | null;
  fecha_alta: string;
  activo: boolean;
  user_id: string;
};
