import { z } from "zod";

export const TURNO_ESTADOS = ["programado", "confirmado", "realizado", "cancelado"] as const;

export const turnoSchema = z
  .object({
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
    // Recurrencia semanal. Solo aplica al alta: editando un turno no se toca.
    recurrente: z.boolean(),
    fecha_fin_recurrencia: z.string().trim(),
  })
  .superRefine((turno, ctx) => {
    if (!turno.recurrente) {
      return;
    }

    if (!turno.fecha_fin_recurrencia) {
      ctx.addIssue({
        code: "custom",
        path: ["fecha_fin_recurrencia"],
        message: "Poné hasta qué fecha se repite.",
      });
      return;
    }

    // fecha_hora llega como "YYYY-MM-DDTHH:MM" y la fecha de fin como
    // "YYYY-MM-DD": alcanza con comparar los primeros 10 caracteres.
    const fechaInicial = turno.fecha_hora.slice(0, 10);
    if (turno.fecha_fin_recurrencia < fechaInicial) {
      ctx.addIssue({
        code: "custom",
        path: ["fecha_fin_recurrencia"],
        message: "Tiene que ser igual o posterior a la fecha del turno.",
      });
    }
  });

export type TurnoFormValues = z.infer<typeof turnoSchema>;
