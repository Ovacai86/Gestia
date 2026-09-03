"use client";

import { startTransition, useActionState, useEffect, type KeyboardEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ExcepcionFormState } from "./actions";
import type { ExcepcionDisponibilidad } from "@/types/disponibilidad";
import { excepcionSchema, type ExcepcionFormValues } from "@/lib/validations/agenda";
import { formatearDiaLargo } from "@/lib/agenda";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// Postgres devuelve "HH:MM:SS"; en pantalla y en los inputs va "HH:MM".
function aHoraCorta(hora: string): string {
  return hora.slice(0, 5);
}

// Una excepción de 00:00 a 23:59 es el día entero: se muestra como tal en vez
// de repetir los horarios, que no aportan nada.
function describirRango(excepcion: ExcepcionDisponibilidad): string {
  const inicio = aHoraCorta(excepcion.hora_inicio);
  const fin = aHoraCorta(excepcion.hora_fin);
  if (inicio === "00:00" && fin === "23:59") {
    return "Día completo";
  }
  return `${inicio} a ${fin}`;
}

export function ExcepcionesSection({
  action,
  eliminar,
  excepciones,
}: {
  action: (state: ExcepcionFormState, formData: FormData) => Promise<ExcepcionFormState>;
  eliminar: (id: string) => Promise<void>;
  excepciones: ExcepcionDisponibilidad[];
}) {
  const [state, formAction, pending] = useActionState(action, { error: null, guardado: false });

  const form = useForm<ExcepcionFormValues>({
    resolver: zodResolver(excepcionSchema),
    defaultValues: { fecha: "", dia_completo: true, hora_inicio: "", hora_fin: "" },
  });

  const diaCompleto = useWatch({ control: form.control, name: "dia_completo" });

  // Después de agregar una se limpia el formulario, así se pueden cargar varias
  // seguidas sin borrar a mano lo anterior.
  useEffect(() => {
    if (state.guardado) {
      form.reset({ fecha: "", dia_completo: true, hora_inicio: "", hora_fin: "" });
    }
  }, [state.guardado, form]);

  // Mismo criterio que en el resto de los formularios: Enter no guarda.
  function bloquearEnter(event: KeyboardEvent<HTMLFormElement>) {
    const etiqueta = (event.target as HTMLElement).tagName;
    if (event.key === "Enter" && etiqueta !== "TEXTAREA" && etiqueta !== "BUTTON") {
      event.preventDefault();
    }
  }

  function onValid(values: ExcepcionFormValues) {
    const formData = new FormData();
    formData.set("fecha", values.fecha);
    if (values.dia_completo) {
      formData.set("dia_completo", "on");
    } else {
      formData.set("hora_inicio", values.hora_inicio);
      formData.set("hora_fin", values.hora_fin);
    }
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <div className="mx-auto mt-8 max-w-2xl rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-medium text-gray-900">Excepciones</h2>
      <p className="mt-1 text-sm text-gray-500">
        Fechas puntuales en las que no atendés —vacaciones, un feriado, una tarde libre— sin tocar
        tu semana habitual. Los bloques que caigan adentro dejan de ofrecerse en la agenda.
      </p>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onValid)}
          onKeyDown={bloquearEnter}
          noValidate
          className="mt-4 space-y-4 border-t border-gray-100 pt-4"
        >
          <div className="flex flex-wrap items-start gap-4">
            <FormField
              control={form.control}
              name="fecha"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha *</FormLabel>
                  <Input
                    {...field}
                    type="date"
                    className="w-48"
                    aria-invalid={!!form.formState.errors.fecha}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {!diaCompleto && (
              <>
                <FormField
                  control={form.control}
                  name="hora_inicio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Desde *</FormLabel>
                      <Input
                        {...field}
                        type="time"
                        className="w-32"
                        aria-invalid={!!form.formState.errors.hora_inicio}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hora_fin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hasta *</FormLabel>
                      <Input
                        {...field}
                        type="time"
                        className="w-32"
                        aria-invalid={!!form.formState.errors.hora_fin}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </div>

          <FormField
            control={form.control}
            name="dia_completo"
            render={({ field }) => (
              <Label className="flex w-fit items-center gap-2">
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                Bloquear el día completo
              </Label>
            )}
          />

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          {state.conflictos && state.conflictos.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">
                {state.conflictos.length === 1
                  ? "Queda 1 turno agendado dentro de esta fecha bloqueada:"
                  : `Quedan ${state.conflictos.length} turnos agendados dentro de esta fecha bloqueada:`}
              </p>
              <ul className="space-y-0.5 text-sm text-amber-900">
                {state.conflictos.map((turno) => (
                  <li key={turno.id}>
                    {turno.hora} — {turno.paciente}{" "}
                    <Link href={`/turnos/${turno.id}`} className="underline">
                      Ver turno
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-gray-600">
                La excepción se guardó igual y no se tocó ningún turno: reprogramalos o cancelalos
                uno por uno si corresponde.
              </p>
            </div>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? "Agregando…" : "Agregar"}
          </Button>
        </form>
      </Form>

      <div className="mt-6 border-t border-gray-100 pt-4">
        {excepciones.length === 0 ? (
          <p className="text-sm text-gray-500">No tenés ninguna fecha bloqueada.</p>
        ) : (
          <ul className="space-y-2">
            {excepciones.map((excepcion) => (
              <li
                key={excepcion.id}
                className="flex items-center justify-between gap-4 rounded-md bg-gray-50 px-3 py-2"
              >
                <span className="text-sm text-gray-900">
                  {formatearDiaLargo(excepcion.fecha)} — {describirRango(excepcion)}
                </span>
                <form action={eliminar.bind(null, excepcion.id)}>
                  <button type="submit" className="text-sm text-red-600 hover:underline">
                    Eliminar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
