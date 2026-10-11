// Builds the database schema and seed SQL from data/snapshot.json.
// Usage: node scripts/build-seed.mjs [table_prefix]
import fs from 'node:fs';
const P = process.argv[2] || '';
const d = JSON.parse(fs.readFileSync(new URL('../data/snapshot.json', import.meta.url)));
const q = v => v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'";
const ins = (table, cols, rows, chunk = 100) => {
  let out = '';
  for (let i = 0; i < rows.length; i += chunk) {
    out += `insert into public.${P}${table} (${cols.join(', ')}) values\n` +
      rows.slice(i, i + chunk).map(r => '(' + cols.map(c => c === 'paths' ? q(JSON.stringify(r[c])) + '::jsonb' : q(r[c])).join(', ') + ')').join(',\n') +
      `\non conflict do nothing;\n\n`;
  }
  return out;
};
const schema = `-- Oil and gas value chain tracker: schema
create table if not exists public.${P}assets (
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
comment on table public.${P}assets is 'Point assets on the map. category: ref refinery, lngx LNG export, lngi LNG import, fsru floating terminal, oil/gas offshore field, ons onshore field, port, choke chokepoint, pwr gas-to-power demand. status: o operating, c under construction, p planned, x offline.';

create table if not exists public.${P}routes (
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
comment on table public.${P}routes is 'Named pipelines and sea lanes. paths is an array of lines, each an array of [longitude, latitude] waypoints.';

create table if not exists public.${P}links (
  id bigint generated always as identity primary key,
  subject text not null,
  direction text not null check (direction in ('in','out')),
  counterparty text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (subject, direction, counterparty)
);
comment on table public.${P}links is 'Value chain links. subject is an asset or route name. direction in = supplied by, out = delivers to. counterparty is another record name (becomes a live link on the map) or free text such as a buyer.';

create table if not exists public.${P}country_balances (
  country text primary key,
  oil_production_mbd numeric not null default 0,
  oil_consumption_mbd numeric not null default 0,
  gas_production_bcm numeric not null default 0,
  gas_consumption_bcm numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.${P}category_defaults (
  category text primary key,
  typical_supplied_by text,
  typical_delivers_to text
);

create index if not exists ${P}assets_category_idx on public.${P}assets (category);
create index if not exists ${P}assets_country_idx on public.${P}assets (country);
create index if not exists ${P}links_subject_idx on public.${P}links (subject);

create or replace function public.${P}touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists ${P}assets_touch on public.${P}assets;
create trigger ${P}assets_touch before update on public.${P}assets for each row execute function public.${P}touch_updated_at();
drop trigger if exists ${P}routes_touch on public.${P}routes;
create trigger ${P}routes_touch before update on public.${P}routes for each row execute function public.${P}touch_updated_at();
drop trigger if exists ${P}country_balances_touch on public.${P}country_balances;
create trigger ${P}country_balances_touch before update on public.${P}country_balances for each row execute function public.${P}touch_updated_at();

-- Public read, no public write. Edits go through the Supabase dashboard or the service role.
${['assets', 'routes', 'links', 'country_balances', 'category_defaults'].map(t => `alter table public.${P}${t} enable row level security;
drop policy if exists "${P}${t} public read" on public.${P}${t};
create policy "${P}${t} public read" on public.${P}${t} for select to anon, authenticated using (true);
revoke all on public.${P}${t} from anon, authenticated;
grant select on public.${P}${t} to anon, authenticated;`).join('\n')}
`;
d.assets.forEach((a, i) => a.sort_order = i);
d.routes.forEach((r, i) => r.sort_order = i);
const seed = '-- Oil and gas value chain tracker: seed data, generated from data/snapshot.json\n\n' +
  ins('assets', ['id', 'category', 'name', 'country', 'lat', 'lon', 'status', 'capacity_text', 'capacity_kbd', 'operator', 'trade_role', 'note', 'vessel_owner', 'charterer', 'charter_end_year', 'charter_note', 'startup_year', 'source', 'checked_on', 'sort_order'], d.assets) +
  ins('routes', ['id', 'category', 'name', 'status', 'capacity_text', 'note', 'startup_year', 'paths', 'sort_order'], d.routes, 40) +
  ins('links', ['subject', 'direction', 'counterparty', 'position'], d.links, 200) +
  ins('country_balances', ['country', 'oil_production_mbd', 'oil_consumption_mbd', 'gas_production_bcm', 'gas_consumption_bcm'], d.country_balances) +
  ins('category_defaults', ['category', 'typical_supplied_by', 'typical_delivers_to'], d.category_defaults);
fs.mkdirSync(new URL('../supabase/migrations/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../supabase/migrations/0001_schema.sql', import.meta.url), schema);
fs.writeFileSync(new URL('../supabase/seed.sql', import.meta.url), seed);
console.log('schema', schema.length, 'seed', seed.length);
