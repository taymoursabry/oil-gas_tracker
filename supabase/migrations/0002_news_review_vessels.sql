-- News, review queue and live vessel positions for the oil and gas tracker.

create table if not exists public.og_news (
  id bigint generated always as identity primary key,
  record text not null,
  headline text not null,
  url text not null,
  source text,
  published_on date,
  summary text,
  created_at timestamptz not null default now(),
  unique (record, url)
);
comment on table public.og_news is 'Dated, sourced headlines per asset or route. record is the asset or route name. Written by the daily scan.';

create table if not exists public.og_change_proposals (
  id bigint generated always as identity primary key,
  record text not null,
  field text not null check (field in ('status','startup_year','charter_end_year','capacity_text','operator','vessel_owner','charterer','note')),
  current_value text,
  proposed_value text,
  reason text,
  source_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
comment on table public.og_change_proposals is 'Review queue. The daily scan proposes changes here. Set status to approved to apply the change to the record, or rejected to dismiss it.';

create table if not exists public.og_vessels (
  mmsi bigint primary key,
  name text,
  ship_type integer,
  lat double precision,
  lon double precision,
  speed real,
  course real,
  destination text,
  updated_at timestamptz not null default now()
);
comment on table public.og_vessels is 'Latest broadcast position per vessel, written by the ais-relay function.';
create index if not exists og_vessels_updated_idx on public.og_vessels (updated_at);
create index if not exists og_news_record_idx on public.og_news (record);

-- Applying an approved proposal updates the matching asset or route and stamps it as checked.
create or replace function public.og_apply_proposal() returns trigger language plpgsql set search_path = '' as $$
declare cast_sql text;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    cast_sql := case when new.field in ('startup_year','charter_end_year') then 'nullif($1, '''')::integer' else '$1' end;
    execute format('update public.og_assets set %I = %s, checked_on = current_date, source = coalesce($2, source) where name = $3', new.field, cast_sql)
      using new.proposed_value, new.source_url, new.record;
    if new.field in ('status','startup_year','capacity_text','note') then
      execute format('update public.og_routes set %I = %s, checked_on = current_date, source = coalesce($2, source) where name = $3', new.field, cast_sql)
        using new.proposed_value, new.source_url, new.record;
    end if;
  end if;
  if new.status <> 'pending' and new.decided_at is null then new.decided_at := now(); end if;
  return new;
end $$;
drop trigger if exists og_change_proposals_apply on public.og_change_proposals;
create trigger og_change_proposals_apply before update on public.og_change_proposals for each row execute function public.og_apply_proposal();

alter table public.og_news enable row level security;
create policy "og_news public read" on public.og_news for select to anon, authenticated using (true);
alter table public.og_change_proposals enable row level security;
create policy "og_change_proposals public read" on public.og_change_proposals for select to anon, authenticated using (true);
alter table public.og_vessels enable row level security;
create policy "og_vessels public read" on public.og_vessels for select to anon, authenticated using (true);
