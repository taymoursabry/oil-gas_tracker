-- Reference point assets from Global Energy Monitor trackers (CC BY 4.0): LNG terminals, oil and gas fields,
-- gas-fired power plants. og_gem_raw is the landing table filled by the gem-points function; og_gem_points is
-- the cleaned table the site reads through og_gem_points_draw(). The transform that fills og_gem_points from
-- og_gem_raw is recorded in the project's Supabase migration history (og_gem_points).
create table if not exists public.og_gem_raw (id bigint generated always as identity primary key, layer text not null, chunk bigint not null, lat double precision, lon double precision, p jsonb not null);
alter table public.og_gem_raw enable row level security;
create table if not exists public.og_gem_points (
  id bigint generated always as identity primary key,
  gid bigint not null, layer text not null check (layer in ('lng','field','power')),
  sub text, name text, unit text, status text not null check (status in ('o','c','p','x')), status_text text,
  country text, operator text, owner text, parent text, capacity_num double precision, start_year text,
  lat double precision not null, lon double precision not null, url text, extra jsonb
);
create index if not exists og_gem_points_gid_idx on public.og_gem_points (gid);
alter table public.og_gem_points enable row level security;
create policy "og_gem_points public read" on public.og_gem_points for select to anon, authenticated using (true);
