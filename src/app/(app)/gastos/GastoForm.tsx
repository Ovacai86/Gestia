"use client";

import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { GastoFormState } from "./actions";
import type { Gasto } from "@/types/gasto";
import { GASTO_CATEGORIAS } from "@/types/gasto";
import { gastoSchema, type GastoFormValues } from "@/lib/validations/gasto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

export function GastoForm({
  action,
  gasto,
}: {
  action: (state: GastoFormState, formData: FormData) => Promise<GastoFormState>;
  gasto?: Gasto;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  const form = useForm<GastoFormValues>({
    resolver: zodResolver(gastoSchema),
    defaultValues: {
      fecha: gasto?.fecha ?? "",
      monto: gasto ? String(gasto.monto) : "",
      categoria: gasto?.categoria as GastoFormValues["categoria"] | undefined,
      descripcion: gasto?.descripcion ?? "",
    },
  });

  function onValid(values: GastoFormValues) {
    const formData = new FormData();
    formData.set("fecha", values.fecha);
    formData.set("monto", values.monto);
    formData.set("categoria", values.categoria);
    formData.set("descripcion", values.descripcion ?? "");

    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <Form {...form}>
      {/* noValidate: la validación la maneja Zod, no el navegador. */}
      <form onSubmit={form.handleSubmit(onValid)} noValidate className="mx-auto max-w-lg space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="fecha"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha *</FormLabel>
                <Input {...field} type="date" aria-invalid={!!form.formState.errors.fecha} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="monto"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monto *</FormLabel>
                <Input
                  {...field}
                  type="number"
                  min={0}
                  step="0.01"
                  aria-invalid={!!form.formState.errors.monto}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="categoria"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Categoría *</FormLabel>
              <Select
                items={GASTO_CATEGORIAS.map((c) => ({ value: c, label: c }))}
                value={field.value || null}
                onValueChange={field.onChange}
              >
                <SelectTrigger className="w-full" aria-invalid={!!form.formState.errors.categoria}>
                  <SelectValue placeholder="Seleccioná una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {GASTO_CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="descripcion"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descripción</FormLabel>
              <Textarea {...field} rows={3} />
              <FormMessage />
            </FormItem>
          )}
        />

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}

        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </form>
    </Form>
  );
}
