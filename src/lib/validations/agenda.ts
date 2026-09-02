import { z } from "zod";

const franjaSchema = z.object({
  hora_inicio: z.string().trim(),
  hora_fin: z.string().trim(),
});

// El form manda siempre las 7 filas, activas o no: así el día desactivado
// conserva sus franjas en vez de perderlas.
const diaSchema = z
  .object({
    dia_semana: z.number().int().min(0).max(6),
    activo: z.boolean(),
    // Numérico como string + validación a mano: z.coerce.number() rompe la
    // inferencia de tipos entre el resolver y useForm.
    duracion_bloque_minutos: z.string().trim(),
    franjas: z.array(franjaSchema),
  })
  .superRefine((dia, ctx) => {
    // Un día apagado no se valida: sus franjas son solo lo que queda guardado.
    if (!dia.activo) {
      return;
    }

    const duracion = Number(dia.duracion_bloque_minutos);
    if (!dia.duracion_bloque_minutos) {
      ctx.addIssue({
        code: "custom",
        path: ["duracion_bloque_minutos"],
        message: "Poné una duración.",
      });
    } else if (!Number.isInteger(duracion) || duracion <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["duracion_bloque_minutos"],
        message: "Tiene que ser un número entero de minutos mayor a cero.",
      });
    }

    if (dia.franjas.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["franjas"],
        message: "Agregá al menos una franja.",
      });
      return;
    }

    dia.franjas.forEach((franja, i) => {
      if (!franja.hora_inicio) {
        ctx.addIssue({
          code: "custom",
          path: ["franjas", i, "hora_inicio"],
          message: "Poné una hora de inicio.",
        });
      }
      if (!franja.hora_fin) {
        ctx.addIssue({
          code: "custom",
          path: ["franjas", i, "hora_fin"],
          message: "Poné una hora de fin.",
        });
      }
      // "HH:MM" con cero a la izquierda se puede comparar como string.
      if (franja.hora_inicio && franja.hora_fin && franja.hora_fin <= franja.hora_inicio) {
        ctx.addIssue({
          code: "custom",
          path: ["franjas", i, "hora_fin"],
          message: "Tiene que ser posterior al inicio.",
        });
      }
    });

    // Dos franjas del mismo día no se pueden pisar: el bloque quedaría contado
    // dos veces en la agenda.
    const ordenadas = dia.franjas
      .map((franja, i) => ({ ...franja, i }))
      .filter((franja) => franja.hora_inicio && franja.hora_fin)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

    for (let n = 1; n < ordenadas.length; n++) {
      const previa = ordenadas[n - 1];
      const actual = ordenadas[n];
      if (actual.hora_inicio < previa.hora_fin) {
        ctx.addIssue({
          code: "custom",
          path: ["franjas", actual.i, "hora_inicio"],
          message: "Se pisa con otra franja del mismo día.",
        });
      }
    }
  });

export const agendaSchema = z.object({
  dias: z.array(diaSchema).length(7),
});

export type AgendaFormValues = z.infer<typeof agendaSchema>;
