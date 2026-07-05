create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  line_user_id text unique not null,
  display_name text,
  nickname text,
  ranking_enabled boolean default false,
  public_display_name text,
  review_count integer default 0,
  last_review_generated_at timestamptz,
  rank text default '見習い職人',
  milestone_tags_synced jsonb default '[]'::jsonb,
  plan text default 'free',
  subscription_status text default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
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
  type text default 'create',
  category_code text,
  category_label text,
  created_at timestamptz default now()
);

alter table public.users add column if not exists nickname text;
alter table public.users add column if not exists ranking_enabled boolean default false;
alter table public.users add column if not exists public_display_name text;
alter table public.users add column if not exists review_count integer default 0;
alter table public.users add column if not exists last_review_generated_at timestamptz;
alter table public.users add column if not exists rank text default '見習い職人';
alter table public.users add column if not exists milestone_tags_synced jsonb default '[]'::jsonb;
alter table public.users add column if not exists plan text default 'free';
alter table public.users add column if not exists subscription_status text default 'free';
alter table public.users add column if not exists stripe_customer_id text;
alter table public.users add column if not exists stripe_subscription_id text;
alter table public.review_histories add column if not exists type text default 'create';
alter table public.review_histories add column if not exists category_code text;
alter table public.review_histories add column if not exists category_label text;

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

create index if not exists idx_review_histories_category_code
  on public.review_histories(category_code);

create index if not exists idx_users_review_count
  on public.users(review_count desc);

create index if not exists idx_users_last_review_generated_at
  on public.users(last_review_generated_at desc);

create index if not exists idx_users_stripe_customer_id
  on public.users(stripe_customer_id);

create index if not exists idx_users_stripe_subscription_id
  on public.users(stripe_subscription_id);

create index if not exists idx_review_histories_type
  on public.review_histories(type);

create index if not exists idx_favorites_user_id
  on public.favorites(user_id);

create index if not exists idx_user_badges_user_id
  on public.user_badges(user_id);

update public.users u
set
  review_count = coalesce(src.review_count, 0),
  last_review_generated_at = src.last_review_generated_at,
  rank = case
    when coalesce(src.review_count, 0) >= 1000 then '伝説の職人'
    when coalesce(src.review_count, 0) >= 300 then '家元'
    when coalesce(src.review_count, 0) >= 100 then '名人'
    when coalesce(src.review_count, 0) >= 50 then '師範'
    when coalesce(src.review_count, 0) >= 20 then '上級職人'
    when coalesce(src.review_count, 0) >= 5 then 'レビュー職人'
    else '見習い職人'
  end,
  updated_at = now()
from (
  select
    line_user_id,
    count(*)::integer as review_count,
    max(created_at) as last_review_generated_at
  from public.review_histories
  group by line_user_id
) src
where u.line_user_id = src.line_user_id;
