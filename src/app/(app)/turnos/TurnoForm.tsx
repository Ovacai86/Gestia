"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { TurnoFormState } from "./actions";
import { ResumenRecurrenciaAviso } from "./ResumenRecurrenciaAviso";
import type { Turno } from "@/types/turno";
import {
  permitePago,
  turnoSchema,
  TURNO_ESTADOS,
  type TurnoFormValues,
} from "@/lib/validations/turno";
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

type PacienteOption = { id: string; nombre_apellido: string; monto_fijo: number | null };

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
  duracionBloque,
}: {
  action: (state: TurnoFormState, formData: FormData) => Promise<TurnoFormState>;
  pacientes: PacienteOption[];
  turno?: Turno;
  // Precarga al llegar desde un bloque libre del calendario. Solo aplica al
  // alta: editando manda siempre lo que ya tiene el turno.
  fechaHoraInicial?: string;
  // La duración global de configuracion_agenda. Null si todavía no se configuró.
  duracionBloque?: number | null;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [pastDateOpen, setPastDateOpen] = useState(false);
  const pendingValuesRef = useRef<TurnoFormValues | null>(null);

  const [fechaInicial, horaInicial] = fechaHoraInicial
    ? [fechaHoraInicial.slice(0, 10), fechaHoraInicial.slice(11, 16)]
    : ["", ""];
  const fechaHoraDelTurno = turno ? toDatetimeLocalValue(turno.fecha_hora) : "";

  const form = useForm<TurnoFormValues>({
    resolver: zodResolver(turnoSchema),
    defaultValues: {
      paciente_id: turno?.paciente_id ?? "",
      fecha: turno ? fechaHoraDelTurno.slice(0, 10) : fechaInicial,
      hora: turno ? fechaHoraDelTurno.slice(11, 16) : horaInicial,
      // Editando manda la duración con la que se creó el turno, no la global:
      // cambiar la configuración no debería reescribir turnos ya agendados.
      duracion_minutos: turno
        ? String(turno.duracion_minutos)
        : duracionBloque != null
          ? String(duracionBloque)
          : "",
      estado: turno?.estado ?? "programado",
      monto: turno?.monto != null ? String(turno.monto) : "",
      pagado: turno?.pagado ?? false,
      motivo_cancelacion: turno?.motivo_cancelacion ?? "",
      recurrente: false,
      fecha_fin_recurrencia: "",
    },
  });

  // useWatch en vez de form.watch: watch() no se puede memoizar y el linter lo
  // marca como incompatible con el compilador de React.
  const estado = useWatch({ control: form.control, name: "estado" });
  const pagado = useWatch({ control: form.control, name: "pagado" });
  const recurrente = useWatch({ control: form.control, name: "recurrente" });
  const pacienteId = useWatch({ control: form.control, name: "paciente_id" });
  const duracion = useWatch({ control: form.control, name: "duracion_minutos" });
  // La recurrencia es solo del alta: editando se toca ese turno y nada más.
  const esAlta = !turno;
  // Llegó de un click en un bloque: fecha y hora ya quedaron elegidas ahí.
  const desdeBloque = esAlta && !!fechaHoraInicial;

  // El monto puede quedar vacío: si el paciente no tiene monto por sesión, el
  // turno se guarda igual y la fila queda con monto null.
  const faltaDuracion = !duracion || Number(duracion) <= 0;
  const bloqueado = faltaDuracion;

  // Pagado solo tiene sentido en un turno que se va a hacer o ya se hizo. El
  // server valida lo mismo: esto es la UX, no la barrera.
  const pagadoHabilitado = permitePago(estado);

  // Si el estado pasa a uno que no admite pago, el tilde no puede quedar
  // colgado: se destilda solo, para no guardar un pagado que la UI ya no deja
  // ver ni tocar.
  useEffect(() => {
    if (!pagadoHabilitado && pagado) {
      form.setValue("pagado", false);
    }
  }, [pagadoHabilitado, pagado, form]);

  // Enter no manda el formulario: con la recurrencia tildada, un Enter de más
  // creaba la serie entera sin pasar por el botón. Se permite en textarea (es
  // un salto de línea) y en botones (ahí Enter es activar el botón, no un
  // submit implícito).
  function bloquearEnter(event: KeyboardEvent<HTMLFormElement>) {
    const etiqueta = (event.target as HTMLElement).tagName;
    if (event.key === "Enter" && etiqueta !== "TEXTAREA" && etiqueta !== "BUTTON") {
      event.preventDefault();
    }
  }

  // El monto sale del paciente, pero solo cuando se elige uno distinto del que
  // ya tenía el turno: editando, el monto con el que se creó no se pisa aunque
  // después haya cambiado el monto_fijo de la ficha.
  const pacienteSincronizado = useRef(turno?.paciente_id ?? "");

  useEffect(() => {
    if (pacienteId === pacienteSincronizado.current) {
      return;
    }

    pacienteSincronizado.current = pacienteId;
    const elegido = pacientes.find((p) => p.id === pacienteId);
    form.setValue("monto", elegido?.monto_fijo != null ? String(elegido.monto_fijo) : "", {
      shouldValidate: true,
    });
  }, [pacienteId, pacientes, form]);

  function submitValues(values: TurnoFormValues) {
    const formData = new FormData();
    formData.set("paciente_id", values.paciente_id);
    // El server sigue recibiendo un solo campo "YYYY-MM-DDTHH:MM": la división
    // en dos inputs es de la UI, no del contrato con la acción.
    formData.set("fecha_hora", `${values.fecha}T${values.hora}`);
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
    const fechaHoraDate = new Date(`${values.fecha}T${values.hora}:00-03:00`);
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
        <form
          // El handler se arma dentro del evento, no en el render: onValid lee un
          // ref y la hora actual, y eso no puede pasar mientras se renderiza.
          onSubmit={(event) => form.handleSubmit(onValid)(event)}
          onKeyDown={bloquearEnter}
          noValidate
          className="mx-auto max-w-lg space-y-4"
        >
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
              name="fecha"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha *</FormLabel>
                  <Input
                    {...field}
                    type="date"
                    readOnly={desdeBloque}
                    className={desdeBloque ? "bg-gray-50 text-gray-600" : undefined}
                    aria-invalid={!!form.formState.errors.fecha}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hora"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hora *</FormLabel>
                  <Input
                    {...field}
                    type="time"
                    readOnly={desdeBloque}
                    className={desdeBloque ? "bg-gray-50 text-gray-600" : undefined}
                    aria-invalid={!!form.formState.errors.hora}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {desdeBloque && (
            <p className="text-xs text-gray-500">
              La fecha y la hora salen del bloque que elegiste en el calendario. Para cambiarlas,
              volvé y elegí otro bloque.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="duracion_minutos"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duración (min)</FormLabel>
                  <Input {...field} readOnly className="bg-gray-50 text-gray-600" />
                  <p className="mt-1 text-xs text-gray-500">
                    {esAlta ? "Definida en tu disponibilidad." : "La que tenía el turno."}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="monto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto</FormLabel>
                  <Input {...field} readOnly className="bg-gray-50 text-gray-600" />
                  <p className="mt-1 text-xs text-gray-500">
                    Sale del monto por sesión del paciente. Queda vacío si no lo tiene cargado.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {faltaDuracion && esAlta && (
            <p className="text-sm text-destructive">
              Todavía no configuraste la duración del bloque.{" "}
              <Link href="/turnos/configuracion" className="underline">
                Cargala en tu disponibilidad
              </Link>{" "}
              antes de agendar un turno.
            </p>
          )}

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
              <div>
                <Label
                  className={
                    pagadoHabilitado
                      ? "flex w-fit items-center gap-2"
                      : "flex w-fit items-center gap-2 text-gray-400"
                  }
                >
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={!pagadoHabilitado}
                  />
                  Pagado
                </Label>
                {!pagadoHabilitado && (
                  <p className="mt-1 text-xs text-gray-500">
                    Se habilita cuando el turno está confirmado o realizado.
                  </p>
                )}
              </div>
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

          {/* Con el resumen a la vista la serie ya se creó: reenviar el mismo
              formulario la duplicaría, así que el botón queda deshabilitado y
              la salida es el link al calendario. */}
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={pending || !!state.resumen || bloqueado}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
            <Link href="/turnos" className="text-sm text-gray-600 hover:text-gray-900">
              Volver a turnos
            </Link>
          </div>
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
