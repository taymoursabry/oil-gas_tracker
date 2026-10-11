-- Oil and gas value chain tracker: schema
create table if not exists public.og_assets (
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
comment on table public.og_assets is 'Point assets on the map. category: ref refinery, lngx LNG export, lngi LNG import, fsru floating terminal, oil/gas offshore field, ons onshore field, port, choke chokepoint, pwr gas-to-power demand. status: o operating, c under construction, p planned, x offline.';

create table if not exists public.og_routes (
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
comment on table public.og_routes is 'Named pipelines and sea lanes. paths is an array of lines, each an array of [longitude, latitude] waypoints.';

create table if not exists public.og_links (
  id bigint generated always as identity primary key,
  subject text not null,
  direction text not null check (direction in ('in','out')),
  counterparty text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (subject, direction, counterparty)
);
comment on table public.og_links is 'Value chain links. subject is an asset or route name. direction in = supplied by, out = delivers to. counterparty is another record name (becomes a live link on the map) or free text such as a buyer.';

create table if not exists public.og_country_balances (
  country text primary key,
  oil_production_mbd numeric not null default 0,
  oil_consumption_mbd numeric not null default 0,
  gas_production_bcm numeric not null default 0,
  gas_consumption_bcm numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.og_category_defaults (
  category text primary key,
  typical_supplied_by text,
  typical_delivers_to text
);

create index if not exists og_assets_category_idx on public.og_assets (category);
create index if not exists og_assets_country_idx on public.og_assets (country);
create index if not exists og_links_subject_idx on public.og_links (subject);

create or replace function public.og_touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists og_assets_touch on public.og_assets;
create trigger og_assets_touch before update on public.og_assets for each row execute function public.og_touch_updated_at();
drop trigger if exists og_routes_touch on public.og_routes;
create trigger og_routes_touch before update on public.og_routes for each row execute function public.og_touch_updated_at();
drop trigger if exists og_country_balances_touch on public.og_country_balances;
create trigger og_country_balances_touch before update on public.og_country_balances for each row execute function public.og_touch_updated_at();

-- Public read, no public write. Edits go through the Supabase dashboard or the service role.
alter table public.og_assets enable row level security;
drop policy if exists "og_assets public read" on public.og_assets;
create policy "og_assets public read" on public.og_assets for select to anon, authenticated using (true);
revoke all on public.og_assets from anon, authenticated;
grant select on public.og_assets to anon, authenticated;
alter table public.og_routes enable row level security;
drop policy if exists "og_routes public read" on public.og_routes;
create policy "og_routes public read" on public.og_routes for select to anon, authenticated using (true);
revoke all on public.og_routes from anon, authenticated;
grant select on public.og_routes to anon, authenticated;
alter table public.og_links enable row level security;
drop policy if exists "og_links public read" on public.og_links;
create policy "og_links public read" on public.og_links for select to anon, authenticated using (true);
revoke all on public.og_links from anon, authenticated;
grant select on public.og_links to anon, authenticated;
alter table public.og_country_balances enable row level security;
drop policy if exists "og_country_balances public read" on public.og_country_balances;
create policy "og_country_balances public read" on public.og_country_balances for select to anon, authenticated using (true);
revoke all on public.og_country_balances from anon, authenticated;
grant select on public.og_country_balances to anon, authenticated;
alter table public.og_category_defaults enable row level security;
drop policy if exists "og_category_defaults public read" on public.og_category_defaults;
create policy "og_category_defaults public read" on public.og_category_defaults for select to anon, authenticated using (true);
revoke all on public.og_category_defaults from anon, authenticated;
grant select on public.og_category_defaults to anon, authenticated;
