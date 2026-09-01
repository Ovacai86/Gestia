import { z } from "zod";
import { GASTO_CATEGORIAS } from "@/types/gasto";

export const gastoSchema = z.object({
  fecha: z.string().trim().min(1, "La fecha es obligatoria."),
  monto: z
    .string()
    .trim()
    .min(1, "El monto es obligatorio.")
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, "El monto debe ser mayor a cero."),
  categoria: z.enum(GASTO_CATEGORIAS, { error: "Elegí una categoría." }),
  descripcion: z.string().trim().optional(),
});

export type GastoFormValues = z.infer<typeof gastoSchema>;
