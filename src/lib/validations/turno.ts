import { z } from "zod";

export const TURNO_ESTADOS = ["programado", "confirmado", "realizado", "cancelado"] as const;

export const turnoSchema = z.object({
  paciente_id: z.string().trim().min(1, "Elegí un paciente."),
  fecha_hora: z.string().trim().min(1, "La fecha y hora son obligatorias."),
  duracion_minutos: z
    .string()
    .trim()
    .min(1, "La duración es obligatoria.")
    .refine(
      (v) => Number.isInteger(Number(v)) && Number(v) > 0,
      "La duración debe ser un número entero mayor a cero.",
    ),
  estado: z.enum(TURNO_ESTADOS),
  monto: z
    .string()
    .trim()
    .min(1, "El monto es obligatorio.")
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "El monto debe ser mayor a cero."),
  pagado: z.boolean(),
  motivo_cancelacion: z.string().trim().optional(),
});

export type TurnoFormValues = z.infer<typeof turnoSchema>;
