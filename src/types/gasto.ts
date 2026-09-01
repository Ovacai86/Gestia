export const GASTO_CATEGORIAS = [
  "Alquiler",
  "Insumos",
  "Servicios",
  "Impuestos",
  "Otros",
] as const;

export type Gasto = {
  id: string;
  fecha: string;
  monto: number;
  categoria: string;
  descripcion: string | null;
  user_id: string;
};
