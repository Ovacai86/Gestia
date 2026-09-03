"use client";

import { startTransition, useActionState, useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { TurnoFormState } from "./actions";
import { ResumenRecurrenciaAviso } from "./ResumenRecurrenciaAviso";
import { repetirTurnoSchema, type RepetirTurnoFormValues } from "@/lib/validations/turno";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

export function RepetirSerieForm({
  action,
  // Primera fecha que puede generar la serie: una semana después del turno.
  primeraFecha,
  diaYHora,
}: {
  action: (state: TurnoFormState, formData: FormData) => Promise<TurnoFormState>;
  primeraFecha: string;
  diaYHora: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [abierto, setAbierto] = useState(false);

  const form = useForm<RepetirTurnoFormValues>({
    resolver: zodResolver(repetirTurnoSchema),
    defaultValues: { fecha_fin_recurrencia: "" },
  });

  // Mismo criterio que en el alta: Enter no dispara el guardado.
  function bloquearEnter(event: KeyboardEvent<HTMLFormElement>) {
    const etiqueta = (event.target as HTMLElement).tagName;
    if (event.key === "Enter" && etiqueta !== "TEXTAREA" && etiqueta !== "BUTTON") {
      event.preventDefault();
    }
  }

  function onValid(values: RepetirTurnoFormValues) {
    const formData = new FormData();
    formData.set("fecha_fin_recurrencia", values.fecha_fin_recurrencia);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <div className="mx-auto mt-8 max-w-lg space-y-3 rounded-lg border border-gray-200 p-4">
      <Label className="flex w-fit items-center gap-2">
        <Checkbox checked={abierto} onCheckedChange={setAbierto} />
        Repetir semanalmente desde este turno
      </Label>

      {abierto && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onValid)} onKeyDown={bloquearEnter} noValidate className="space-y-4">
            <p className="text-sm text-gray-500">
              Crea un turno por semana los {diaYHora}, con el mismo paciente, duración y monto.
              Este turno no se toca ni se duplica: la serie arranca la semana siguiente, y los
              turnos nuevos nacen programados y sin pagar.
            </p>

            <FormField
              control={form.control}
              name="fecha_fin_recurrencia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Repetir hasta *</FormLabel>
                  <Input
                    {...field}
                    type="date"
                    min={primeraFecha}
                    className="w-48"
                    aria-invalid={!!form.formState.errors.fecha_fin_recurrencia}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Se crea un turno por semana hasta esta fecha inclusive. Las semanas que caigan
                    antes de hoy se saltean.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {state.error && <p className="text-sm text-destructive">{state.error}</p>}

            {state.resumen && <ResumenRecurrenciaAviso resumen={state.resumen} />}

            {/* Con el resumen a la vista la serie ya se creó: reenviar duplicaría. */}
            <Button type="submit" disabled={pending || !!state.resumen}>
              {pending ? "Creando…" : "Crear repeticiones"}
            </Button>
          </form>
        </Form>
      )}
    </div>
  );
}
