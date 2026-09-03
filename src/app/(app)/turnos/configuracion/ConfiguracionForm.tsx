"use client";

import { startTransition, useActionState } from "react";
import { useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AgendaFormState } from "./actions";
import {
  DIAS_SEMANA,
  HORARIO_POR_DEFECTO,
  type ConfiguracionAgenda,
  type DisponibilidadConFranjas,
} from "@/types/disponibilidad";
import { agendaSchema, type AgendaFormValues } from "@/lib/validations/agenda";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// Postgres devuelve time como "HH:MM:SS"; el input type="time" quiere "HH:MM".
function aHoraInput(hora: string) {
  return hora.slice(0, 5);
}

function valoresIniciales(
  disponibilidades: DisponibilidadConFranjas[],
  configuracion: ConfiguracionAgenda | null,
): AgendaFormValues {
  return {
    // Sin fila de configuración el campo arranca vacío: no hay duración por
    // defecto, la carga el profesional.
    duracion_bloque_minutos: configuracion ? String(configuracion.duracion_bloque_minutos) : "",
    dias: DIAS_SEMANA.map((_, i) => {
      const guardado = disponibilidades.find((d) => d.dia_semana === i);
      const franjas = (guardado?.franja_horaria ?? [])
        .map((f) => ({
          hora_inicio: aHoraInput(f.hora_inicio),
          hora_fin: aHoraInput(f.hora_fin),
        }))
        .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

      return {
        dia_semana: i,
        activo: guardado?.activo ?? false,
        // Un día sin franjas arranca con una propuesta, para que activarlo no
        // deje la fila vacía.
        franjas:
          franjas.length > 0
            ? franjas
            : [{ hora_inicio: HORARIO_POR_DEFECTO.inicio, hora_fin: HORARIO_POR_DEFECTO.fin }],
      };
    }),
  };
}

// useFieldArray es por nombre, así que las franjas de cada día van en su propio
// componente: no se pueden llamar 7 hooks dentro de un map.
function FranjasDelDia({
  control,
  indice,
}: {
  control: Control<AgendaFormValues>;
  indice: number;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `dias.${indice}.franjas`,
  });

  return (
    <div className="space-y-2">
      {fields.map((field, j) => (
        <div key={field.id} className="flex flex-wrap items-start gap-3">
          <FormField
            control={control}
            name={`dias.${indice}.franjas.${j}.hora_inicio`}
            render={({ field: input }) => (
              <FormItem>
                <FormLabel className="text-xs text-gray-500">Desde</FormLabel>
                <Input {...input} type="time" className="w-32" />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`dias.${indice}.franjas.${j}.hora_fin`}
            render={({ field: input }) => (
              <FormItem>
                <FormLabel className="text-xs text-gray-500">Hasta</FormLabel>
                <Input {...input} type="time" className="w-32" />
                <FormMessage />
              </FormItem>
            )}
          />
          {fields.length > 1 && (
            <button
              type="button"
              onClick={() => remove(j)}
              className="mt-6 text-sm text-red-600 hover:underline"
            >
              Quitar
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          append({ hora_inicio: HORARIO_POR_DEFECTO.inicio, hora_fin: HORARIO_POR_DEFECTO.fin })
        }
        className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
      >
        + Agregar franja
      </button>
    </div>
  );
}

export function ConfiguracionForm({
  action,
  disponibilidades,
  configuracion,
}: {
  action: (state: AgendaFormState, formData: FormData) => Promise<AgendaFormState>;
  disponibilidades: DisponibilidadConFranjas[];
  configuracion: ConfiguracionAgenda | null;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null, guardado: false });

  const form = useForm<AgendaFormValues>({
    resolver: zodResolver(agendaSchema),
    defaultValues: valoresIniciales(disponibilidades, configuracion),
  });

  // Las franjas de un día solo se muestran si el día está activo.
  const dias = useWatch({ control: form.control, name: "dias" });

  function onValid(values: AgendaFormValues) {
    const formData = new FormData();
    formData.set("duracion_bloque_minutos", values.duracion_bloque_minutos);
    values.dias.forEach((dia, i) => {
      formData.set(`dias.${i}.activo`, String(dia.activo));
      formData.set(`dias.${i}.franjas.length`, String(dia.franjas.length));
      dia.franjas.forEach((franja, j) => {
        formData.set(`dias.${i}.franjas.${j}.hora_inicio`, franja.hora_inicio);
        formData.set(`dias.${i}.franjas.${j}.hora_fin`, franja.hora_fin);
      });
    });

    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <Form {...form}>
      {/* noValidate: la validación la maneja Zod, no el navegador. */}
      <form onSubmit={form.handleSubmit(onValid)} noValidate className="mx-auto max-w-2xl space-y-6">
        {/* La duración es una sola para toda la agenda, no una por día. */}
        <div>
          <h2 className="mb-2 text-sm font-medium text-gray-700">Duración del turno</h2>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <FormField
              control={form.control}
              name="duracion_bloque_minutos"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-gray-500">Minutos</FormLabel>
                  <Input {...field} type="number" min={1} step={1} className="w-32" />
                  <p className="mt-1 text-xs text-gray-500">
                    Aplica a todos los días. Se carga en minutos, con números enteros.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium text-gray-700">Días de atención</h2>
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {DIAS_SEMANA.map((nombre, i) => {
              const activo = dias?.[i]?.activo ?? false;

              return (
                <div key={nombre} className="flex flex-wrap items-start gap-x-6 gap-y-3 px-4 py-3">
                  <FormField
                    control={form.control}
                    name={`dias.${i}.activo`}
                    render={({ field }) => (
                      <FormItem className="flex w-40 shrink-0 flex-row items-center gap-3 space-y-0 pt-1">
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                        <FormLabel className="font-normal text-gray-900">{nombre}</FormLabel>
                      </FormItem>
                    )}
                  />

                  {activo ? (
                    <div className="flex-1">
                      <FranjasDelDia control={form.control} indice={i} />
                    </div>
                  ) : (
                    <p className="pt-2 text-sm text-gray-400">Sin atención</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state.guardado && !state.error && (
          <p className="text-sm text-green-600">Disponibilidad guardada.</p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </form>
    </Form>
  );
}
