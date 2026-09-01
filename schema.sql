-- ===========================================================
-- Foliq — Supabase schema
-- Run this once in your project's SQL Editor (Supabase Dashboard
-- → SQL Editor → New query → paste → Run).
-- ===========================================================

create extension if not exists pgcrypto;

create table if not exists public.portfolios (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  slug        text,
  name        text not null,
  age         int not null,
  location    text,
  data        jsonb not null default '{}'::jsonb,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists portfolios_user_id_idx on public.portfolios (user_id);
create unique index if not exists portfolios_slug_unique_idx on public.portfolios (slug) where slug is not null;

-- keep updated_at fresh on every UPDATE
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_portfolios_updated_at on public.portfolios;
create trigger trg_portfolios_updated_at
before update on public.portfolios
for each row execute function public.set_updated_at();

-- ===========================================================
-- Row Level Security
-- ===========================================================
alter table public.portfolios enable row level security;

-- Owners can see all of their own portfolios (draft or published)
drop policy if exists "owners can select own portfolios" on public.portfolios;
create policy "owners can select own portfolios"
  on public.portfolios for select
  using (auth.uid() = user_id);

-- Anyone (including logged-out visitors) can read a PUBLISHED portfolio,
-- which is what powers the public /portfolio.html?name= page.
drop policy if exists "anyone can select published portfolios" on public.portfolios;
create policy "anyone can select published portfolios"
  on public.portfolios for select
  using (published = true);

-- Owners can create portfolios for themselves only
drop policy if exists "owners can insert own portfolios" on public.portfolios;
create policy "owners can insert own portfolios"
  on public.portfolios for insert
  with check (auth.uid() = user_id);

-- Owners can update only their own portfolios
drop policy if exists "owners can update own portfolios" on public.portfolios;
create policy "owners can update own portfolios"
  on public.portfolios for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Owners can delete only their own portfolios
drop policy if exists "owners can delete own portfolios" on public.portfolios;
create policy "owners can delete own portfolios"
  on public.portfolios for delete
  using (auth.uid() = user_id);
