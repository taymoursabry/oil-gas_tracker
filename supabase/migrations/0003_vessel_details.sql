-- Extra vessel particulars broadcast by the ship itself.
alter table public.og_vessels
  add column if not exists imo bigint,
  add column if not exists callsign text,
  add column if not exists length_m real,
  add column if not exists beam_m real,
  add column if not exists draught_m real,
  add column if not exists eta text,
  add column if not exists nav_status integer;
