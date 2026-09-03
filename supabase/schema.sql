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
  -- Lo que cobra este paciente por sesión. Se copia a turno.monto al crear el
  -- turno; nullable mientras no se haya definido.
  monto_fijo numeric(10, 2)
    constraint paciente_monto_fijo_check check (monto_fijo is null or monto_fijo > 0),
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
  -- Quién originó el turno. Hoy siempre 'profesional'; queda lista para
  -- cuando el paciente pueda pedir turno por su cuenta.
  origen text not null default 'profesional'
    constraint turno_origen_check check (origen in ('profesional', 'paciente')),
  -- No lleva default: lo completa el trigger de más abajo según origen
  -- (true si lo cargó el profesional, false si lo pidió el paciente).
  -- Un default de columna no puede referenciar otra columna de la misma fila.
  aceptado_por_profesional boolean not null,
  user_id uuid not null references auth.users (id) default auth.uid()
);

-- Completa aceptado_por_profesional cuando el insert no lo trae explícito.
-- Corre antes de que se validen las constraints, así que el not null de la
-- columna se chequea con el valor ya resuelto.
create or replace function turno_default_aceptado_por_profesional()
returns trigger
language plpgsql
as $function$
begin
  if new.aceptado_por_profesional is null then
    new.aceptado_por_profesional := (new.origen = 'profesional');
  end if;
  return new;
end;
$function$;

drop trigger if exists turno_aceptado_por_profesional_default on turno;
create trigger turno_aceptado_por_profesional_default
  before insert on turno
  for each row
  execute function turno_default_aceptado_por_profesional();

create table if not exists gasto (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  monto numeric(10, 2) not null,
  categoria text not null,
  descripcion text,
  user_id uuid not null references auth.users (id) default auth.uid()
);

-- Un día de la semana en la agenda: un registro por día y por usuario.
-- El día se desactiva con activo = false en vez de borrarse, para no perder
-- las franjas ya cargadas. La duración del bloque no vive acá: es una sola
-- para toda la agenda y está en configuracion_agenda.
create table if not exists disponibilidad (
  id uuid primary key default gen_random_uuid(),
  dia_semana int not null
    constraint disponibilidad_dia_semana_check check (dia_semana between 0 and 6),
  activo boolean not null default true,
  user_id uuid not null references auth.users (id) default auth.uid(),
  constraint disponibilidad_dia_unico unique (user_id, dia_semana)
);

-- La duración del bloque, única para toda la agenda. Sin default: mientras no
-- haya fila, la duración está "sin configurar" y la agenda no ofrece bloques.
create table if not exists configuracion_agenda (
  id uuid primary key default gen_random_uuid(),
  duracion_bloque_minutos int not null
    constraint configuracion_agenda_duracion_check check (duracion_bloque_minutos > 0),
  user_id uuid not null unique references auth.users (id) default auth.uid()
);

-- Los tramos de atención de un día. Van en tabla aparte para soportar el día
-- partido (ej. lunes de 09:00 a 11:00 y de 14:00 a 18:00).
create table if not exists franja_horaria (
  id uuid primary key default gen_random_uuid(),
  disponibilidad_id uuid not null references disponibilidad (id) on delete cascade,
  hora_inicio time not null,
  hora_fin time not null,
  user_id uuid not null references auth.users (id) default auth.uid(),
  constraint franja_horaria_rango_check check (hora_fin > hora_inicio)
);

create index if not exists paciente_user_id_idx on paciente (user_id);
create index if not exists turno_user_id_idx on turno (user_id);
create index if not exists turno_paciente_id_idx on turno (paciente_id);
create index if not exists gasto_user_id_idx on gasto (user_id);
create index if not exists disponibilidad_user_id_idx on disponibilidad (user_id);
create index if not exists configuracion_agenda_user_id_idx on configuracion_agenda (user_id);
create index if not exists franja_horaria_user_id_idx on franja_horaria (user_id);
create index if not exists franja_horaria_disponibilidad_id_idx on franja_horaria (disponibilidad_id);

alter table paciente enable row level security;
alter table turno enable row level security;
alter table gasto enable row level security;
alter table disponibilidad enable row level security;
alter table configuracion_agenda enable row level security;
alter table franja_horaria enable row level security;

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

create policy "disponibilidad_select_own" on disponibilidad for select using (user_id = auth.uid());
create policy "disponibilidad_insert_own" on disponibilidad for insert with check (user_id = auth.uid());
create policy "disponibilidad_update_own" on disponibilidad for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "disponibilidad_delete_own" on disponibilidad for delete using (user_id = auth.uid());

create policy "configuracion_agenda_select_own" on configuracion_agenda for select using (user_id = auth.uid());
create policy "configuracion_agenda_insert_own" on configuracion_agenda for insert with check (user_id = auth.uid());
create policy "configuracion_agenda_update_own" on configuracion_agenda for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "configuracion_agenda_delete_own" on configuracion_agenda for delete using (user_id = auth.uid());

create policy "franja_horaria_select_own" on franja_horaria for select using (user_id = auth.uid());
create policy "franja_horaria_insert_own" on franja_horaria for insert with check (user_id = auth.uid());
create policy "franja_horaria_update_own" on franja_horaria for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "franja_horaria_delete_own" on franja_horaria for delete using (user_id = auth.uid());

-- Migración: estado "confirmado" y motivo de cancelación en turno.
-- Correr esto en un proyecto que ya tenía el schema anterior aplicado
-- (en un proyecto nuevo, el create type/create table de arriba ya lo incluyen).
alter type turno_estado add value if not exists 'confirmado';
alter table turno add column if not exists motivo_cancelacion text;

-- Migración: agenda (disponibilidad, configuracion_agenda y columnas de turno).
-- Este bloque es idempotente: en un proyecto que ya tenía el schema anterior
-- aplicado, alcanza con correr desde acá hasta el final.
create table if not exists disponibilidad (
  id uuid primary key default gen_random_uuid(),
  dia_semana int not null
    constraint disponibilidad_dia_semana_check check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fin time not null,
  activo boolean not null default true,
  user_id uuid not null references auth.users (id) default auth.uid(),
  constraint disponibilidad_rango_check check (hora_fin > hora_inicio),
  constraint disponibilidad_dia_unico unique (user_id, dia_semana)
);

create table if not exists configuracion_agenda (
  id uuid primary key default gen_random_uuid(),
  duracion_bloque_minutos int not null default 50
    constraint configuracion_agenda_duracion_check check (duracion_bloque_minutos > 0),
  user_id uuid not null unique references auth.users (id) default auth.uid()
);

create index if not exists disponibilidad_user_id_idx on disponibilidad (user_id);
create index if not exists configuracion_agenda_user_id_idx on configuracion_agenda (user_id);

alter table disponibilidad enable row level security;
alter table configuracion_agenda enable row level security;

drop policy if exists "disponibilidad_select_own" on disponibilidad;
drop policy if exists "disponibilidad_insert_own" on disponibilidad;
drop policy if exists "disponibilidad_update_own" on disponibilidad;
drop policy if exists "disponibilidad_delete_own" on disponibilidad;
create policy "disponibilidad_select_own" on disponibilidad for select using (user_id = auth.uid());
create policy "disponibilidad_insert_own" on disponibilidad for insert with check (user_id = auth.uid());
create policy "disponibilidad_update_own" on disponibilidad for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "disponibilidad_delete_own" on disponibilidad for delete using (user_id = auth.uid());

drop policy if exists "configuracion_agenda_select_own" on configuracion_agenda;
drop policy if exists "configuracion_agenda_insert_own" on configuracion_agenda;
drop policy if exists "configuracion_agenda_update_own" on configuracion_agenda;
drop policy if exists "configuracion_agenda_delete_own" on configuracion_agenda;
create policy "configuracion_agenda_select_own" on configuracion_agenda for select using (user_id = auth.uid());
create policy "configuracion_agenda_insert_own" on configuracion_agenda for insert with check (user_id = auth.uid());
create policy "configuracion_agenda_update_own" on configuracion_agenda for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "configuracion_agenda_delete_own" on configuracion_agenda for delete using (user_id = auth.uid());

alter table turno add column if not exists origen text not null default 'profesional';

do $migracion$
begin
  -- Si ya se había aplicado una versión anterior de este bloque, la columna
  -- se llamaba confirmado: se renombra en vez de crear una segunda.
  if exists (
    select 1 from information_schema.columns
    where table_name = 'turno' and column_name = 'confirmado'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'turno' and column_name = 'aceptado_por_profesional'
  ) then
    alter table turno rename column confirmado to aceptado_por_profesional;
    alter table turno alter column aceptado_por_profesional drop default;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'turno_origen_check') then
    alter table turno add constraint turno_origen_check check (origen in ('profesional', 'paciente'));
  end if;
end
$migracion$;

-- Se agrega nullable, se completan las filas existentes según origen y recién
-- ahí se marca not null (una tabla con datos no acepta not null sin default).
alter table turno add column if not exists aceptado_por_profesional boolean;
update turno set aceptado_por_profesional = (origen = 'profesional')
  where aceptado_por_profesional is null;
alter table turno alter column aceptado_por_profesional set not null;

create or replace function turno_default_aceptado_por_profesional()
returns trigger
language plpgsql
as $function$
begin
  if new.aceptado_por_profesional is null then
    new.aceptado_por_profesional := (new.origen = 'profesional');
  end if;
  return new;
end;
$function$;

drop trigger if exists turno_aceptado_por_profesional_default on turno;
create trigger turno_aceptado_por_profesional_default
  before insert on turno
  for each row
  execute function turno_default_aceptado_por_profesional();

-- Migración: día partido (varias franjas por día) y duración por día.
-- Este bloque es idempotente: se puede correr desde acá hasta el final.
-- La duración deja de ser global y pasa a cada día; los horarios salen de
-- disponibilidad y se mudan a franja_horaria, que admite N por día.

alter table disponibilidad
  add column if not exists duracion_bloque_minutos int not null default 50;

do $migracion$
begin
  if not exists (select 1 from pg_constraint where conname = 'disponibilidad_duracion_check') then
    alter table disponibilidad
      add constraint disponibilidad_duracion_check check (duracion_bloque_minutos > 0);
  end if;
end
$migracion$;

-- Cada día hereda la duración global que había en configuracion_agenda.
update disponibilidad d
set duracion_bloque_minutos = c.duracion_bloque_minutos
from configuracion_agenda c
where c.user_id = d.user_id
  and d.duracion_bloque_minutos = 50
  and c.duracion_bloque_minutos <> 50;

create table if not exists franja_horaria (
  id uuid primary key default gen_random_uuid(),
  disponibilidad_id uuid not null references disponibilidad (id) on delete cascade,
  hora_inicio time not null,
  hora_fin time not null,
  user_id uuid not null references auth.users (id) default auth.uid(),
  constraint franja_horaria_rango_check check (hora_fin > hora_inicio)
);

create index if not exists franja_horaria_user_id_idx on franja_horaria (user_id);
create index if not exists franja_horaria_disponibilidad_id_idx on franja_horaria (disponibilidad_id);

alter table franja_horaria enable row level security;

drop policy if exists "franja_horaria_select_own" on franja_horaria;
drop policy if exists "franja_horaria_insert_own" on franja_horaria;
drop policy if exists "franja_horaria_update_own" on franja_horaria;
drop policy if exists "franja_horaria_delete_own" on franja_horaria;
create policy "franja_horaria_select_own" on franja_horaria for select using (user_id = auth.uid());
create policy "franja_horaria_insert_own" on franja_horaria for insert with check (user_id = auth.uid());
create policy "franja_horaria_update_own" on franja_horaria for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "franja_horaria_delete_own" on franja_horaria for delete using (user_id = auth.uid());

-- El horario que hoy vive en disponibilidad pasa a ser la primera franja de
-- cada día. Solo corre si las columnas viejas todavía existen.
do $migracion$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'disponibilidad' and column_name = 'hora_inicio'
  ) then
    insert into franja_horaria (disponibilidad_id, hora_inicio, hora_fin, user_id)
    select d.id, d.hora_inicio, d.hora_fin, d.user_id
    from disponibilidad d
    where not exists (select 1 from franja_horaria f where f.disponibilidad_id = d.id);

    alter table disponibilidad drop column hora_inicio;
    alter table disponibilidad drop column hora_fin;
  end if;
end
$migracion$;

-- Migración: la duración del bloque vuelve a ser global.
-- Deja de estar por día en disponibilidad y vuelve a configuracion_agenda,
-- que ya existía sin uso. No se migra ningún valor: el campo arranca vacío
-- (sin fila) y el profesional carga la duración a mano desde la pantalla de
-- disponibilidad. Sin fila, la agenda no ofrece bloques.
-- Este bloque es idempotente: se puede correr desde acá hasta el final.

delete from configuracion_agenda;

alter table configuracion_agenda
  alter column duracion_bloque_minutos drop default;

alter table configuracion_agenda enable row level security;

drop policy if exists "configuracion_agenda_select_own" on configuracion_agenda;
drop policy if exists "configuracion_agenda_insert_own" on configuracion_agenda;
drop policy if exists "configuracion_agenda_update_own" on configuracion_agenda;
drop policy if exists "configuracion_agenda_delete_own" on configuracion_agenda;
create policy "configuracion_agenda_select_own" on configuracion_agenda for select using (user_id = auth.uid());
create policy "configuracion_agenda_insert_own" on configuracion_agenda for insert with check (user_id = auth.uid());
create policy "configuracion_agenda_update_own" on configuracion_agenda for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "configuracion_agenda_delete_own" on configuracion_agenda for delete using (user_id = auth.uid());

create index if not exists configuracion_agenda_user_id_idx on configuracion_agenda (user_id);

-- Al borrar la columna se va con ella su check de duración.
alter table disponibilidad drop column if exists duracion_bloque_minutos;

-- Migración: monto fijo por paciente.
-- Lo que se le cobra a ese paciente por sesión. El alta de turno lo copia a
-- turno.monto, así que un cambio posterior no toca los turnos ya creados.
-- Este bloque es idempotente: se puede correr desde acá hasta el final.

alter table paciente
  add column if not exists monto_fijo numeric(10, 2);

do $migracion$
begin
  if not exists (select 1 from pg_constraint where conname = 'paciente_monto_fijo_check') then
    alter table paciente
      add constraint paciente_monto_fijo_check check (monto_fijo is null or monto_fijo > 0);
  end if;
end
$migracion$;
