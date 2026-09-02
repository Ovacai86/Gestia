"use client";

import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { PacienteFormState } from "./actions";
import type { Paciente } from "@/types/paciente";
import { pacienteSchema, type PacienteFormValues } from "@/lib/validations/paciente";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

export function PacienteForm({
  action,
  paciente,
}: {
  action: (state: PacienteFormState, formData: FormData) => Promise<PacienteFormState>;
  paciente?: Paciente;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  const form = useForm<PacienteFormValues>({
    resolver: zodResolver(pacienteSchema),
    defaultValues: {
      nombre_apellido: paciente?.nombre_apellido ?? "",
      dni: paciente?.dni ?? "",
      telefono: paciente?.telefono ?? "",
      email: paciente?.email ?? "",
      obra_social: paciente?.obra_social ?? "",
      notas: paciente?.notas ?? "",
      activo: paciente?.activo ?? true,
    },
  });

  function onValid(values: PacienteFormValues) {
    const formData = new FormData();
    formData.set("nombre_apellido", values.nombre_apellido);
    formData.set("dni", values.dni);
    formData.set("telefono", values.telefono ?? "");
    formData.set("email", values.email ?? "");
    formData.set("obra_social", values.obra_social ?? "");
    formData.set("notas", values.notas ?? "");
    if (values.activo) {
      formData.set("activo", "on");
    }
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <Form {...form}>
      {/* noValidate: la validación la maneja Zod, no el navegador. Sin esto, el
          browser bloquea el submit (ej. type="email" inválido) y nunca se muestran
          los errores inline. */}
      <form onSubmit={form.handleSubmit(onValid)} noValidate className="mx-auto max-w-lg space-y-4">
        <FormField
          control={form.control}
          name="nombre_apellido"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre y apellido *</FormLabel>
              <Input {...field} aria-invalid={!!form.formState.errors.nombre_apellido} />
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="dni"
            render={({ field }) => (
              <FormItem>
                <FormLabel>DNI *</FormLabel>
                <Input {...field} inputMode="numeric" aria-invalid={!!form.formState.errors.dni} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="telefono"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono</FormLabel>
                <Input {...field} aria-invalid={!!form.formState.errors.telefono} />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <Input {...field} type="email" aria-invalid={!!form.formState.errors.email} />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="obra_social"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Obra social</FormLabel>
              <Input {...field} />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notas"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notas</FormLabel>
              <Textarea {...field} rows={3} />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="activo"
          render={({ field }) => (
            <Label className="flex w-fit items-center gap-2">
              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              Activo
            </Label>
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
