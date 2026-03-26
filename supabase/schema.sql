-- Run this in Supabase SQL editor before migrating local data.

create table if not exists public.users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null,
  reset_token text,
  reset_expires_at timestamptz
);

create table if not exists public.uploads (
  id text primary key,
  user_id text references public.users(id) on delete cascade,
  group_id text,
  overlay_text text not null default '',
  gif_storage_key text not null,
  created_at timestamptz not null,
  expires_at timestamptz,
  scan_count integer not null default 0,
  customization jsonb not null default '{"colors":{"dark":"#221D23","light":"#D0E37F"}}'::jsonb
);

create index if not exists uploads_group_id_idx on public.uploads(group_id);
create index if not exists uploads_user_id_idx on public.uploads(user_id);
create index if not exists uploads_created_at_idx on public.uploads(created_at);
