# Gestia — CLAUDE.md

## Qué es este proyecto
Gestia es una app web para gestión de Centro Terapéutico. 
Permite administrar pacientes, turnos, cobros y gastos del consultorio. 
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

## Modelo de datos

### paciente
- id (uuid, PK)
- nombre_apellido (text)
- dni (text)
- telefono (text)
- email (text)
- obra_social (text, nullable)
- notas (text, nullable)
- fecha_alta (date)
- activo (boolean, default true)
- user_id (uuid, FK a auth.users)

### turno
- id (uuid, PK)
- paciente_id (uuid, FK a paciente)
- fecha_hora (timestamp)
- duracion_minutos (int)
- estado (enum: programado / confirmado / realizado / cancelado)
- monto (numeric)
- pagado (boolean, default false)
- motivo_cancelacion (text, nullable — solo aplica si estado = cancelado)
- user_id (uuid, FK a auth.users)

### gasto
- id (uuid, PK)
- fecha (date)
- monto (numeric)
- categoria (text)
- descripcion (text, nullable)
- user_id (uuid, FK a auth.users)

## Convenciones de código
- Nombres de archivos y componentes en inglés, texto de la interfaz en español.
- Usar Server Components de Next.js por default; Client Components solo cuando haga falta interactividad.
- Toda tabla de Supabase debe tener Row Level Security (RLS) activado, filtrando por user_id = auth.uid().
- No exponer claves de Supabase tipo "service_role" en el cliente — solo la anon key pública.

## Comandos
- `npm run dev` — levantar entorno de desarrollo
- `npm run build` — build de producción
- `npm run lint` — chequear estilo de código

## Reglas generales
- Priorizar simplicidad sobre flexibilidad: este es un MVP para un solo usuario.
- Preguntar antes de agregar dependencias nuevas no mencionadas acá.
- Si algo de este archivo queda desactualizado a medida que avanza el proyecto, actualizarlo.
