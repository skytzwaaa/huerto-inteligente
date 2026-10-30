-- Huerto Inteligente: tablas para Supabase (pegar en SQL Editor y pulsar Run)

create table if not exists sensores (
  id int primary key default 1, soil1_pct int, soil2_pct int, temp real, hum real, tank_pct int,
  pump smallint default 0, ts timestamptz default now(), constraint una_fila check (id = 1));
insert into sensores (id) values (1) on conflict do nothing;

create table if not exists historial (
  id bigserial primary key, soil1_pct int, soil2_pct int, temp real, hum real, tank_pct int,
  ts timestamptz default now());
create index if not exists historial_ts_idx on historial (ts desc);

create table if not exists control (
  id int primary key default 1, pump_cmd boolean default false, constraint una_fila_ctl check (id = 1));
insert into control (id, pump_cmd) values (1, false) on conflict do nothing;

create table if not exists usuarios (
  id serial primary key, usuario text unique not null, hash text not null, fallos int default 0,
  bloqueado_hasta timestamptz, creado timestamptz default now());

create table if not exists alertas (
  id bigserial primary key, tipo text not null, nivel text not null default 'info', titulo text not null,
  detalle text, ts timestamptz default now(), leida boolean default false);
create index if not exists alertas_ts_idx on alertas (ts desc);

create table if not exists camara (
  id int primary key default 1, img text, ts timestamptz, constraint una_cam check (id = 1));

-- Seguridad: nadie puede leer estas tablas por la API pública de Supabase.
-- La app entra por la conexión directa de Postgres, que no se ve afectada.
alter table sensores  enable row level security;
alter table historial enable row level security;
alter table control   enable row level security;
alter table usuarios  enable row level security;
alter table alertas   enable row level security;
alter table camara    enable row level security;
