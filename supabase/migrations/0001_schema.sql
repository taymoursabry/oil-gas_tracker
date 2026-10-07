-- Oil and gas value chain tracker: schema
create table if not exists public.assets (
  id text primary key,
  category text not null check (category in ('ref','lngx','lngi','fsru','oil','gas','ons','port','choke','pwr')),
  name text not null unique,
  country text,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  status text not null default 'o' check (status in ('o','c','p','x')),
  capacity_text text,
  capacity_kbd numeric,
  operator text,
  trade_role text,
  note text,
  vessel_owner text,
  charterer text,
  charter_end_year integer,
  charter_note text,
  startup_year integer,
  source text,
  checked_on date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.assets is 'Point assets on the map. category: ref refinery, lngx LNG export, lngi LNG import, fsru floating terminal, oil/gas offshore field, ons onshore field, port, choke chokepoint, pwr gas-to-power demand. status: o operating, c under construction, p planned, x offline.';

create table if not exists public.routes (
  id text primary key,
  category text not null check (category in ('poil','pgas','rcrude','rlng','rprod')),
  name text not null unique,
  status text not null default 'o' check (status in ('o','c','p','x')),
  capacity_text text,
  note text,
  startup_year integer,
  source text,
  checked_on date,
  paths jsonb not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.routes is 'Named pipelines and sea lanes. paths is an array of lines, each an array of [longitude, latitude] waypoints.';

create table if not exists public.links (
  id bigint generated always as identity primary key,
  subject text not null,
  direction text not null check (direction in ('in','out')),
  counterparty text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (subject, direction, counterparty)
);
comment on table public.links is 'Value chain links. subject is an asset or route name. direction in = supplied by, out = delivers to. counterparty is another record name (becomes a live link on the map) or free text such as a buyer.';

create table if not exists public.country_balances (
  country text primary key,
  oil_production_mbd numeric not null default 0,
  oil_consumption_mbd numeric not null default 0,
  gas_production_bcm numeric not null default 0,
  gas_consumption_bcm numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.category_defaults (
  category text primary key,
  typical_supplied_by text,
  typical_delivers_to text
);

create index if not exists assets_category_idx on public.assets (category);
create index if not exists assets_country_idx on public.assets (country);
create index if not exists links_subject_idx on public.links (subject);

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists assets_touch on public.assets;
create trigger assets_touch before update on public.assets for each row execute function public.touch_updated_at();
drop trigger if exists routes_touch on public.routes;
create trigger routes_touch before update on public.routes for each row execute function public.touch_updated_at();
drop trigger if exists country_balances_touch on public.country_balances;
create trigger country_balances_touch before update on public.country_balances for each row execute function public.touch_updated_at();

-- Public read, no public write. Edits go through the Supabase dashboard or the service role.
alter table public.assets enable row level security;
drop policy if exists "assets public read" on public.assets;
create policy "assets public read" on public.assets for select to anon, authenticated using (true);
grant select on public.assets to anon, authenticated;
alter table public.routes enable row level security;
drop policy if exists "routes public read" on public.routes;
create policy "routes public read" on public.routes for select to anon, authenticated using (true);
grant select on public.routes to anon, authenticated;
alter table public.links enable row level security;
drop policy if exists "links public read" on public.links;
create policy "links public read" on public.links for select to anon, authenticated using (true);
grant select on public.links to anon, authenticated;
alter table public.country_balances enable row level security;
drop policy if exists "country_balances public read" on public.country_balances;
create policy "country_balances public read" on public.country_balances for select to anon, authenticated using (true);
grant select on public.country_balances to anon, authenticated;
alter table public.category_defaults enable row level security;
drop policy if exists "category_defaults public read" on public.category_defaults;
create policy "category_defaults public read" on public.category_defaults for select to anon, authenticated using (true);
grant select on public.category_defaults to anon, authenticated;
