"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ResumenRecurrencia, TurnoFormState } from "./actions";
import type { Turno } from "@/types/turno";
import { formatearDiaCorto } from "@/lib/agenda";
import { turnoSchema, TURNO_ESTADOS, type TurnoFormValues } from "@/lib/validations/turno";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

type PacienteOption = { id: string; nombre_apellido: string };

// Los turnos de la serie se crean siempre; esto es el parte de lo que quedó
// pisado o fuera de horario, para que el profesional revise esos casos.
function ResumenRecurrenciaAviso({ resumen }: { resumen: ResumenRecurrencia }) {
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-medium text-gray-900">
        Se crearon {resumen.creados} turnos, del {formatearDiaCorto(resumen.desde)} al{" "}
        {formatearDiaCorto(resumen.hasta)}.
      </p>

      {resumen.colisiones.length > 0 && (
        <div>
          <p className="text-sm font-medium text-amber-900">
            {resumen.colisiones.length === 1
              ? "1 turno se superpone con otro que ya existía:"
              : `${resumen.colisiones.length} turnos se superponen con otros que ya existían:`}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-amber-900">
            {resumen.colisiones.map((c) => (
              <li key={`${c.fecha}-${c.hora}-${c.con}`}>
                {formatearDiaCorto(c.fecha)} — pisa a {c.con} ({c.hora})
              </li>
            ))}
          </ul>
        </div>
      )}

      {resumen.fueraDeHorario.length > 0 && (
        <div>
          <p className="text-sm font-medium text-amber-900">
            {resumen.fueraDeHorario.length === 1
              ? "1 turno quedó fuera de tu disponibilidad:"
              : `${resumen.fueraDeHorario.length} turnos quedaron fuera de tu disponibilidad:`}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-amber-900">
            {resumen.fueraDeHorario.map((fecha) => (
              <li key={fecha}>{formatearDiaCorto(fecha)}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-gray-600">
        Están todos cargados. Revisalos en el calendario y ajustá los que haga falta.
      </p>
      <Link
        href="/turnos"
        className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Ir al calendario
      </Link>
    </div>
  );
}

const ESTADO_LABELS: Record<(typeof TURNO_ESTADOS)[number], string> = {
  programado: "Programado",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

// Mismo motivo que en actions.ts: forzamos AR (-03:00) en vez de usar la
// timezone local del proceso que renderiza (server en SSR vs. browser).
function toDatetimeLocalValue(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function TurnoForm({
  action,
  pacientes,
  turno,
  fechaHoraInicial,
  duracionInicial,
}: {
  action: (state: TurnoFormState, formData: FormData) => Promise<TurnoFormState>;
  pacientes: PacienteOption[];
  turno?: Turno;
  // Precarga al llegar desde un bloque libre del calendario. Solo aplica al
  // alta: editando manda siempre lo que ya tiene el turno.
  fechaHoraInicial?: string;
  duracionInicial?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [pastDateOpen, setPastDateOpen] = useState(false);
  const pendingValuesRef = useRef<TurnoFormValues | null>(null);

  const form = useForm<TurnoFormValues>({
    resolver: zodResolver(turnoSchema),
    defaultValues: {
      paciente_id: turno?.paciente_id ?? "",
      fecha_hora: turno ? toDatetimeLocalValue(turno.fecha_hora) : (fechaHoraInicial ?? ""),
      duracion_minutos: turno ? String(turno.duracion_minutos) : (duracionInicial ?? "50"),
      estado: turno?.estado ?? "programado",
      monto: turno ? String(turno.monto) : "",
      pagado: turno?.pagado ?? false,
      motivo_cancelacion: turno?.motivo_cancelacion ?? "",
      recurrente: false,
      fecha_fin_recurrencia: "",
    },
  });

  const estado = form.watch("estado");
  const recurrente = form.watch("recurrente");
  // La recurrencia es solo del alta: editando se toca ese turno y nada más.
  const esAlta = !turno;

  function submitValues(values: TurnoFormValues) {
    const formData = new FormData();
    formData.set("paciente_id", values.paciente_id);
    formData.set("fecha_hora", values.fecha_hora);
    formData.set("duracion_minutos", values.duracion_minutos);
    formData.set("estado", values.estado);
    formData.set("monto", values.monto);
    if (values.pagado) {
      formData.set("pagado", "on");
    }
    formData.set("motivo_cancelacion", values.motivo_cancelacion ?? "");
    if (esAlta && values.recurrente) {
      formData.set("recurrente", "on");
      formData.set("fecha_fin_recurrencia", values.fecha_fin_recurrencia);
    }

    startTransition(() => {
      formAction(formData);
    });
  }

  function onValid(values: TurnoFormValues) {
    const fechaHoraDate = new Date(`${values.fecha_hora}:00-03:00`);
    if (fechaHoraDate.getTime() < Date.now()) {
      pendingValuesRef.current = values;
      setPastDateOpen(true);
      return;
    }
    submitValues(values);
  }

  function confirmPastDate() {
    setPastDateOpen(false);
    if (pendingValuesRef.current) {
      submitValues(pendingValuesRef.current);
      pendingValuesRef.current = null;
    }
  }

  return (
    <>
      <Form {...form}>
        {/* noValidate: la validación la maneja Zod, no el navegador. */}
        <form onSubmit={form.handleSubmit(onValid)} noValidate className="mx-auto max-w-lg space-y-4">
          <FormField
            control={form.control}
            name="paciente_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Paciente *</FormLabel>
                <Select
                  items={pacientes.map((p) => ({ value: p.id, label: p.nombre_apellido }))}
                  value={field.value || null}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-invalid={!!form.formState.errors.paciente_id}
                  >
                    <SelectValue placeholder="Seleccioná un paciente" />
                  </SelectTrigger>
                  <SelectContent>
                    {pacientes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre_apellido}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="fecha_hora"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha y hora *</FormLabel>
                  <Input
                    {...field}
                    type="datetime-local"
                    aria-invalid={!!form.formState.errors.fecha_hora}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="duracion_minutos"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duración (min)</FormLabel>
                  <Input
                    {...field}
                    type="number"
                    min={0}
                    aria-invalid={!!form.formState.errors.duracion_minutos}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="estado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <Select
                    items={TURNO_ESTADOS.map((value) => ({ value, label: ESTADO_LABELS[value] }))}
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TURNO_ESTADOS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {ESTADO_LABELS[value]}
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

          {estado === "cancelado" && (
            <FormField
              control={form.control}
              name="motivo_cancelacion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo de cancelación</FormLabel>
                  <Textarea {...field} rows={2} />
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="pagado"
            render={({ field }) => (
              <Label className="flex w-fit items-center gap-2">
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                Pagado
              </Label>
            )}
          />

          {esAlta && (
            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              <FormField
                control={form.control}
                name="recurrente"
                render={({ field }) => (
                  <Label className="flex w-fit items-center gap-2">
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    Repetir todas las semanas
                  </Label>
                )}
              />

              {recurrente && (
                <FormField
                  control={form.control}
                  name="fecha_fin_recurrencia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Repetir hasta *</FormLabel>
                      <Input
                        {...field}
                        type="date"
                        className="w-48"
                        aria-invalid={!!form.formState.errors.fecha_fin_recurrencia}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Se crea un turno por semana, el mismo día y horario, hasta esta fecha
                        inclusive.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          )}

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          {state.resumen && <ResumenRecurrenciaAviso resumen={state.resumen} />}

          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </form>
      </Form>

      <AlertDialog open={pastDateOpen} onOpenChange={setPastDateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fecha en el pasado</AlertDialogTitle>
            <AlertDialogDescription>
              Estás cargando un turno con fecha pasada, ¿confirmás?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPastDate}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
