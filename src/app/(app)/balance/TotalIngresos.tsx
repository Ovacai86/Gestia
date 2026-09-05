"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// El total de ingresos es el número que más se mira justo después de cobrar o
// de cancelar, y es el que más fácil queda viejo. revalidatePath no alcanza
// para dos casos que no dependen del servidor:
//
//  - volver a /balance con el botón Atrás, donde Next sirve siempre la copia
//    que quedó en el Router Cache del cliente;
//  - tener el balance abierto en una pestaña mientras se edita en otra.
//
// Por eso el número se monta en el cliente: el valor lo sigue calculando el
// servidor (llega ya formateado), y acá solo se vuelve a pedir la página cuando
// hace falta.
export function TotalIngresos({ monto }: { monto: string }) {
  const router = useRouter();

  useEffect(() => {
    // Al montar: cubre la vuelta con Atrás. Entrando por un link es un pedido
    // de más, pero es el precio de que el número no mienta nunca.
    router.refresh();

    // Volver el foco a la pestaña: cubre el balance abierto en una pestaña
    // mientras se edita en otra.
    function alRecuperarFoco() {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }

    // Vuelta desde el bfcache del navegador (Atrás después de una navegación
    // dura, como escribir la URL a mano). Ahí el documento se restaura
    // congelado tal cual estaba: no se remonta nada, así que el refresh de
    // arriba no llega a correr, y visibilitychange tampoco dispara.
    //
    // Va reload() y no router.refresh(): sobre un documento restaurado del
    // bfcache el refresh del router no llega a pintar nada (probado: el total
    // seguía en el valor congelado). El reload no puede ciclar, porque el
    // documento nuevo entra con persisted = false.
    function alRestaurarDelBfcache(event: PageTransitionEvent) {
      if (event.persisted) {
        location.reload();
      }
    }

    document.addEventListener("visibilitychange", alRecuperarFoco);
    window.addEventListener("pageshow", alRestaurarDelBfcache);
    return () => {
      document.removeEventListener("visibilitychange", alRecuperarFoco);
      window.removeEventListener("pageshow", alRestaurarDelBfcache);
    };
  }, [router]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-sm text-gray-500">Total de ingresos</div>
      <div className="mt-1 text-2xl font-semibold text-green-600">{monto}</div>
    </div>
  );
}
