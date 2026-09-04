import { z } from "zod";

export const TURNO_ESTADOS = ["programado", "confirmado", "realizado", "cancelado"] as const;

// Un turno solo puede figurar pagado si la sesión se va a hacer o ya se hizo:
// en "programado" todavía no hay nada cobrado, y un "cancelado" que se había
// cobrado se resuelve con una devolución, no dejándolo marcado como pagado.
export const ESTADOS_CON_PAGO = ["confirmado", "realizado"] as const;

export function permitePago(estado: (typeof TURNO_ESTADOS)[number]): boolean {
  return (ESTADOS_CON_PAGO as readonly string[]).includes(estado);
}

export const turnoSchema = z
  .object({
    paciente_id: z.string().trim().min(1, "Elegí un paciente."),
    // Fecha y hora van separadas: el calendario precarga las dos cuando el alta
    // sale de un bloque, y así cada una muestra su propio error.
    fecha: z.string().trim().min(1, "La fecha es obligatoria."),
    hora: z.string().trim().min(1, "La hora es obligatoria."),
    duracion_minutos: z
      .string()
      .trim()
      .min(1, "La duración es obligatoria.")
      .refine(
        (v) => Number.isInteger(Number(v)) && Number(v) > 0,
        "La duración debe ser un número entero mayor a cero.",
      ),
    estado: z.enum(TURNO_ESTADOS),
    // Opcional: si el paciente no tiene monto por sesión, el turno se guarda
    // igual y el monto queda sin cargar.
    monto: z
      .string()
      .trim()
      .refine(
        (v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0),
        "El monto tiene que ser un número.",
      ),
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

    // Las dos son "YYYY-MM-DD": se comparan como string sin parsear.
    if (turno.fecha_fin_recurrencia < turno.fecha) {
      ctx.addIssue({
        code: "custom",
        path: ["fecha_fin_recurrencia"],
        message: "Tiene que ser igual o posterior a la fecha del turno.",
      });
    }
  });

export type TurnoFormValues = z.infer<typeof turnoSchema>;

// Repetir un turno que ya existe: lo único que se pide es hasta cuándo. Que la
// fecha sea posterior al turno lo valida el server, que es el que lo conoce.
export const repetirTurnoSchema = z.object({
  fecha_fin_recurrencia: z.string().trim().min(1, "Poné hasta qué fecha se repite."),
});

export type RepetirTurnoFormValues = z.infer<typeof repetirTurnoSchema>;
