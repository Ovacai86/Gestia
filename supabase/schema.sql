-- Gestia — schema inicial (paciente, turno, gasto) con Row Level Security.
-- Ejecutar en Supabase: Project > SQL Editor > New query > pegar y correr.

create type turno_estado as enum ('programado', 'confirmado', 'realizado', 'cancelado');

create table if not exists paciente (
  id uuid primary key default gen_random_uuid(),
  nombre_apellido text not null,
  dni text,
  telefono text,
  email text,
  obra_social text,
  notas text,
  fecha_alta date not null default current_date,
  activo boolean not null default true,
  user_id uuid not null references auth.users (id) default auth.uid()
);

create table if not exists turno (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references paciente (id) on delete cascade,
  fecha_hora timestamptz not null,
  duracion_minutos int not null default 50,
  estado turno_estado not null default 'programado',
  monto numeric(10, 2) not null default 0,
  pagado boolean not null default false,
  motivo_cancelacion text,
  user_id uuid not null references auth.users (id) default auth.uid()
);

create table if not exists gasto (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  monto numeric(10, 2) not null,
  categoria text not null,
  descripcion text,
  user_id uuid not null references auth.users (id) default auth.uid()
);

create index if not exists paciente_user_id_idx on paciente (user_id);
create index if not exists turno_user_id_idx on turno (user_id);
create index if not exists turno_paciente_id_idx on turno (paciente_id);
create index if not exists gasto_user_id_idx on gasto (user_id);

alter table paciente enable row level security;
alter table turno enable row level security;
alter table gasto enable row level security;

create policy "paciente_select_own" on paciente for select using (user_id = auth.uid());
create policy "paciente_insert_own" on paciente for insert with check (user_id = auth.uid());
create policy "paciente_update_own" on paciente for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "paciente_delete_own" on paciente for delete using (user_id = auth.uid());

create policy "turno_select_own" on turno for select using (user_id = auth.uid());
create policy "turno_insert_own" on turno for insert with check (user_id = auth.uid());
create policy "turno_update_own" on turno for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "turno_delete_own" on turno for delete using (user_id = auth.uid());

create policy "gasto_select_own" on gasto for select using (user_id = auth.uid());
create policy "gasto_insert_own" on gasto for insert with check (user_id = auth.uid());
create policy "gasto_update_own" on gasto for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "gasto_delete_own" on gasto for delete using (user_id = auth.uid());

-- Migración: estado "confirmado" y motivo de cancelación en turno.
-- Correr esto en un proyecto que ya tenía el schema anterior aplicado
-- (en un proyecto nuevo, el create type/create table de arriba ya lo incluyen).
alter type turno_estado add value if not exists 'confirmado';
alter table turno add column if not exists motivo_cancelacion text;
