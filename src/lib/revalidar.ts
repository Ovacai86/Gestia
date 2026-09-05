import { revalidatePath } from "next/cache";

// Un turno o un gasto que cambia mueve dos pantallas, no una: la propia y
// /balance, que suma los turnos cobrados y los gastos del período. Van juntas
// acá porque olvidarse de /balance en una sola acción es justo lo que dejaba el
// total viejo después de cancelar un turno o de cambiarle el monto.
//
// El balance es una ruta dinámica (lee cookies y searchParams): no hay Full
// Route Cache ni ISR que purgar. Esto es contra el Router Cache del cliente,
// que si no conserva la copia de la última visita.

export function revalidarTurnos() {
  revalidatePath("/turnos");
  revalidatePath("/balance");
}

export function revalidarGastos() {
  revalidatePath("/gastos");
  revalidatePath("/balance");
}
