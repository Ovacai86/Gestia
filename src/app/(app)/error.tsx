"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
      <p className="text-sm font-medium text-red-600">Ocurrió un error al cargar los datos.</p>
      <p className="mt-1 text-sm text-gray-500">Probá de nuevo en unos segundos.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Reintentar
      </button>
    </div>
  );
}
