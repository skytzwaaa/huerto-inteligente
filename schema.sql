-- Ejecutar una sola vez en el SQL Editor de Neon

-- Última lectura (una sola fila, id = 1)
create table if not exists sensores (
  id        int primary key default 1,
  soil1_pct int,
  soil2_pct int,
  temp      real,
  hum       real,
  tank_pct  int,
  pump      smallint default 0,
  ts        timestamptz default now(),
  constraint una_fila check (id = 1)
);
insert into sensores (id) values (1) on conflict do nothing;

-- Historial (el ESP32 guarda un registro cada 5 min)
create table if not exists historial (
  id        bigserial primary key,
  soil1_pct int,
  soil2_pct int,
  temp      real,
  hum       real,
  tank_pct  int,
  ts        timestamptz default now()
);
create index if not exists historial_ts_idx on historial (ts desc);

-- Orden de la bomba (una sola fila, id = 1)
create table if not exists control (
  id       int primary key default 1,
  pump_cmd boolean default false,
  constraint una_fila_ctl check (id = 1)
);
insert into control (id, pump_cmd) values (1, false) on conflict do nothing;
