import { z } from "zod";

const DNI_REGEX = /^\d{7,8}$/;
const TELEFONO_REGEX = /^[0-9+\-\s]{6,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const pacienteSchema = z.object({
  nombre_apellido: z.string().trim().min(1, "El nombre y apellido es obligatorio."),
  dni: z
    .string()
    .trim()
    .min(1, "El DNI es obligatorio.")
    .regex(DNI_REGEX, "El DNI debe tener solo números, entre 7 y 8 dígitos."),
  telefono: z
    .string()
    .trim()
    .regex(TELEFONO_REGEX, "Teléfono inválido: solo números, espacios, + o -.")
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .regex(EMAIL_REGEX, "El email no tiene un formato válido.")
    .optional()
    .or(z.literal("")),
  obra_social: z.string().trim().optional(),
  notas: z.string().trim().optional(),
  activo: z.boolean(),
});

export type PacienteFormValues = z.infer<typeof pacienteSchema>;
