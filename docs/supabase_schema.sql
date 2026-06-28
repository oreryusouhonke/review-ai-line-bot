create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  line_user_id text unique not null,
  display_name text,
  nickname text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.review_histories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  line_user_id text not null,
  place_id text,
  place_name text,
  place_address text,
  review_text text,
  memo text,
  created_at timestamptz default now()
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  place_id text,
  place_name text,
  place_address text,
  created_at timestamptz default now()
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  badge_code text,
  earned_at timestamptz default now()
);

create index if not exists idx_review_histories_line_user_id_created_at
  on public.review_histories(line_user_id, created_at desc);

create index if not exists idx_review_histories_user_id_created_at
  on public.review_histories(user_id, created_at desc);

create index if not exists idx_favorites_user_id
  on public.favorites(user_id);

create index if not exists idx_user_badges_user_id
  on public.user_badges(user_id);
