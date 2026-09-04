# Gestia — CLAUDE.md

## Qué es este proyecto
Gestia es una app web para gestión de Centro Terapéutico. 
Permite administrar pacientes, turnos, agenda de disponibilidad, cobros y gastos
del consultorio. 
Es la v1/MVP, pensada para un solo profesional (sin login de paciente, sin IA, sin facturación AFIP).

## Para quién
Uso personal del profesional dueño de la cuenta. Pensado con arquitectura que 
podría escalar a multi-profesional en el futuro, pero NO implementar esa lógica todavía.

## Qué NO hace este v1 (explícitamente fuera de scope)
- IA / transcripción / generación de informes clínicos
- Login o portal para el paciente
- Facturación electrónica AFIP/ARCA
- Recordatorios automáticos (WhatsApp/email)
- Cobro online real vía MercadoPago (los pagos se registran manualmente)
- Soporte multi-profesional (aunque el modelo de datos no lo bloquee)

No agregar estas features salvo que se pida explícitamente.

## Stack técnico
- Next.js (App Router) — frontend y backend
- Supabase — base de datos (Postgres) y autenticación
- Vercel — hosting/deploy
- TypeScript
- Tailwind CSS para estilos
- shadcn/ui (estilo `base-nova`, sobre @base-ui/react) para componentes
- react-hook-form + Zod (`@hookform/resolvers`) para formularios y validación

## Modelo de datos

### paciente
- id (uuid, PK)
- nombre_apellido (text)
- dni (text, nullable en la base)
- telefono (text, nullable)
- email (text, nullable)
- obra_social (text, nullable)
- notas (text, nullable)
- monto_fijo (numeric, nullable — check: > 0)
- fecha_alta (date, default hoy)
- activo (boolean, default true)
- user_id (uuid, FK a auth.users)

El formulario exige nombre y DNI (7 u 8 dígitos), pero la base los acepta vacíos:
la restricción es de UX, no de schema.

### turno
- id (uuid, PK)
- paciente_id (uuid, FK a paciente)
- fecha_hora (timestamptz)
- duracion_minutos (int, default 50)
- estado (enum: programado / confirmado / realizado / cancelado)
- monto (numeric, nullable — sin default)
- pagado (boolean, default false)
- motivo_cancelacion (text, nullable — solo aplica si estado = cancelado)
- origen (text: 'profesional' / 'paciente', default 'profesional')
- aceptado_por_profesional (boolean, not null, sin default)
- user_id (uuid, FK a auth.users)

`monto` sale del `monto_fijo` del paciente al crear el turno y queda congelado en
la fila: si después cambia la ficha, los turnos ya creados no se tocan. Si el
paciente no tiene monto definido, el turno se guarda igual con monto null y el
balance lo suma como cero.
`origen` deja preparada el alta de turno pedida por el paciente, pero en v1 la app
siempre inserta 'profesional': no hay portal de paciente.
`aceptado_por_profesional` no lleva default de columna (un default no puede
referenciar otra columna de la misma fila): lo completa el trigger
`turno_aceptado_por_profesional_default`, que antes de cada insert lo resuelve como
`origen = 'profesional'` cuando viene en null.

`pagado` solo puede ser true si el estado es `confirmado` o `realizado`
(`ESTADOS_CON_PAGO` / `permitePago` en `src/lib/validations/turno.ts`): en
`programado` todavía no hay nada cobrado y un `cancelado` cobrado se resuelve con
una devolución. El formulario deshabilita el check y lo destilda solo al cambiar a
un estado que no lo admite; `crearTurno` y `actualizarTurno` rechazan el guardado
igual, por si llega salteando el form. La restricción es de app, no de schema.

En el alta con recurrencia, el `pagado` del formulario vale solo para el turno base
(la primera fecha, el que el profesional está cargando): las repeticiones se crean
siempre con `pagado = false`.

### gasto
- id (uuid, PK)
- fecha (date)
- monto (numeric)
- categoria (text)
- descripcion (text, nullable)
- user_id (uuid, FK a auth.users)

La categoría es texto libre en la base: las cinco opciones (`GASTO_CATEGORIAS` en
`src/types/gasto.ts`) las impone el formulario, no el schema.

### disponibilidad
- id (uuid, PK)
- dia_semana (int, 0 = domingo a 6 = sábado — único por usuario)
- activo (boolean, default true)
- user_id (uuid, FK a auth.users)

Un registro por día de la semana. El día se desactiva con `activo = false` en vez
de borrarse, para no perder las franjas que tenía cargadas.

### franja_horaria
- id (uuid, PK)
- disponibilidad_id (uuid, FK a disponibilidad, on delete cascade)
- hora_inicio (time)
- hora_fin (time — check: hora_fin > hora_inicio)
- user_id (uuid, FK a auth.users)

Los tramos de atención de un día. Van en tabla aparte para soportar el día partido
(ej. lunes de 09:00 a 11:00 y de 14:00 a 18:00).

### excepcion_disponibilidad
- id (uuid, PK)
- fecha (date)
- hora_inicio (time)
- hora_fin (time — check: hora_fin > hora_inicio)
- user_id (uuid, FK a auth.users)

Fechas puntuales bloqueadas (vacaciones, feriados, un día con otro horario) sin
tocar la disponibilidad semanal. Los bloques que caen dentro del rango no se
ofrecen en la agenda.

### configuracion_agenda
- id (uuid, PK)
- duracion_bloque_minutos (int, sin default — check: > 0)
- user_id (uuid, FK a auth.users, unique — una sola fila por usuario)

La duración del bloque es una sola para toda la agenda, no una por día. No tiene
default a propósito: mientras no exista la fila, la duración está "sin configurar",
el campo se muestra vacío y la agenda no ofrece ningún bloque.

## Rutas
Todo cuelga del grupo `(app)`, que exige sesión; `/login` es la única ruta pública.
- `/` — inicio
- `/pacientes`, `/pacientes/nuevo`, `/pacientes/[id]` — listado, alta y edición
- `/turnos` — agenda con vista de semana y de mes, navegable por fecha
- `/turnos/nuevo` — alta de turno, con opción de repetirlo semanalmente hasta una
  fecha de fin (tope de 200 turnos por recurrencia)
- `/turnos/[id]` — edición de un turno, y desde ahí se puede repetir semanalmente
  hacia adelante: crea las semanas siguientes con el mismo día, horario, paciente,
  duración y monto, sin tocar ni duplicar el original. Si el turno pertenece a una
  serie también se puede cancelar en bloque, al estilo Outlook: solo este turno,
  este y los siguientes, o toda la serie (ver "Series de turnos")
- `/turnos/configuracion` — disponibilidad: qué días se atiende, una o más franjas
  horarias por día y la duración del bloque (global, en configuracion_agenda). Es la
  pantalla que alimenta los bloques que ofrece la agenda: sin días cargados o sin
  duración, la agenda no propone ningún horario. Abajo se cargan las excepciones
  (fechas puntuales bloqueadas); al guardar una, los turnos que quedan adentro no se
  tocan: se listan para resolverlos a mano.
- `/gastos`, `/gastos/nuevo`, `/gastos/[id]` — listado, alta y edición
- `/balance` — totales de ingresos y egresos

## Series de turnos
Una serie no existe como fila ni como columna: es el conjunto de turnos del mismo
paciente que caen el mismo día de la semana y a la misma hora, calculado en memoria
sobre `fecha_hora` leída en calendario AR. La lógica vive en `src/lib/serie.ts`
(`armarSerie`, `turnosEnAlcance`, `planificarCancelacion`), que es código puro y lo
comparten el cliente y la server action.

Al cancelar en bloque ("este y los siguientes" o "toda la serie") hay reglas de
protección: nunca se cancela un turno `realizado`, uno con `pagado = true` ni uno con
fecha anterior a hoy. Esos se saltean y se listan con el motivo en el resumen que se
muestra ANTES de confirmar. Los turnos ya cancelados no se cuentan ni se listan: no son
un salteo. "Solo este turno" no pasa por el resumen ni por las protecciones — es el
comportamiento de siempre, equivalente a poner Estado = Cancelado y guardar.

El resumen que ve el usuario lo calcula el cliente para que sea instantáneo, pero
`cancelarSerie` rehace el mismo plan en el servidor antes de escribir: la pantalla es
UX, la barrera es la acción.

## Convenciones de código
- Nombres de archivos y componentes en inglés, texto de la interfaz en español.
- Usar Server Components de Next.js por default; Client Components solo cuando haga falta interactividad.
- Toda tabla de Supabase debe tener Row Level Security (RLS) activado, filtrando por user_id = auth.uid().
- No exponer claves de Supabase tipo "service_role" en el cliente — solo la anon key pública.
- Los schemas de validación viven centralizados en `src/lib/validations/` (uno por entidad).
- Los formularios usan react-hook-form + zodResolver y muestran el error de cada campo
  debajo del input (`FormMessage` de `src/components/ui/form.tsx`), no un mensaje genérico al pie.
- Los campos numéricos se validan como string con `.refine()` en vez de `z.coerce.number()`:
  coerce rompe la inferencia de tipos entre el resolver y `useForm`.
- Las server actions siguen validando del lado del servidor: el schema de Zod es la primera
  barrera (UX), no la única.

## Comandos
- `npm run dev` — levantar entorno de desarrollo
- `npm run build` — build de producción
- `npm run lint` — chequear estilo de código

## Reglas generales
- Priorizar simplicidad sobre flexibilidad: este es un MVP para un solo usuario.
- Preguntar antes de agregar dependencias nuevas no mencionadas acá.
- Si algo de este archivo queda desactualizado a medida que avanza el proyecto, actualizarlo.
