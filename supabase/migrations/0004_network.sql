-- Pipeline network with attributes (Global Energy Monitor oil and gas infrastructure trackers, CC BY 4.0).
-- Filled by the net-import function, window by window. The site draws it through og_network_draw().
create table if not exists public.og_network (
  id bigint generated always as identity primary key,
  src text not null, chunk bigint not null,
  kind text not null check (kind in ('g','l')),
  pid text, name text, segment text, fuel text,
  status text not null default 'o' check (status in ('o','c','p','x')),
  status_text text, owner text, parent text, capacity_text text, start_year text, countries text,
  length_km real, url text, enc jsonb not null
);
create index if not exists og_network_src_chunk_idx on public.og_network (src, chunk);
alter table public.og_network enable row level security;
create policy "og_network public read" on public.og_network for select to anon, authenticated using (true);
create or replace function public.og_network_draw() returns json language sql stable set search_path = '' as $$
  select coalesce(json_agg(json_build_array(id, kind, status, enc)), '[]'::json) from public.og_network
$$;
grant execute on function public.og_network_draw() to anon, authenticated;
