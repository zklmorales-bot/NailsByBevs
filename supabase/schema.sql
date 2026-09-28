-- Nails by Bevs Supabase schema

create extension if not exists pgcrypto;

do $$ begin
  create type public.booking_status as enum ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED');
exception when duplicate_object then null;
end $$;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  phone text,
  preferred_date date not null,
  preferred_time time not null,
  service_summary text not null,
  booking_type text not null check (booking_type in ('BASE', 'BASE_AND_REMOVAL')),
  base_service text not null check (base_service in ('Soft Gel Nail Extensions', 'Gel Polish')),
  addons jsonb not null default '[]'::jsonb,
  removal_source text check (removal_source is null or removal_source in ('My work', 'Not my work')),
  removal_service text check (removal_service is null or removal_service in ('Soft Gel', 'Gel')),
  status public.booking_status not null default 'PENDING',
  admin_note text,
  confirmation_sent_at timestamptz,
  reference_image_paths text[] not null default '{}'
);

create table if not exists public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  block_date date not null,
  block_time text not null,
  status text not null default 'BLOCKED' check (status in ('BLOCKED', 'OPEN')),
  admin_note text,
  unique (block_date, block_time)
);

create index if not exists bookings_date_time_status_idx
  on public.bookings (preferred_date, preferred_time, status);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

create or replace function public.confirm_booking(p_booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.bookings;
  conflict_exists boolean;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into target from public.bookings where id = p_booking_id for update;
  if target.id is null then
    raise exception 'Booking not found';
  end if;

  select exists (
    select 1 from public.bookings other
    where other.preferred_date = target.preferred_date
      and other.preferred_time = target.preferred_time
      and other.status = 'CONFIRMED'
      and other.id <> target.id
  ) into conflict_exists;

  if conflict_exists then
    raise exception 'That time slot is already confirmed';
  end if;

  update public.bookings
  set status = 'CONFIRMED'
  where id = p_booking_id
  returning * into target;

  return target;
end;
$$;

alter table public.admin_users enable row level security;
alter table public.bookings enable row level security;
alter table public.availability_blocks enable row level security;

 drop policy if exists admin_users_self_read on public.admin_users;
create policy admin_users_self_read on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

 drop policy if exists admins_read_bookings on public.bookings;
create policy admins_read_bookings on public.bookings
  for select to authenticated using (public.is_admin());

 drop policy if exists admins_update_bookings on public.bookings;
create policy admins_update_bookings on public.bookings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

 drop policy if exists admins_read_blocks on public.availability_blocks;
create policy admins_read_blocks on public.availability_blocks
  for select to authenticated using (public.is_admin());

 drop policy if exists admins_insert_blocks on public.availability_blocks;
create policy admins_insert_blocks on public.availability_blocks
  for insert to authenticated with check (public.is_admin());

 drop policy if exists admins_update_blocks on public.availability_blocks;
create policy admins_update_blocks on public.availability_blocks
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

 drop policy if exists admins_delete_blocks on public.availability_blocks;
create policy admins_delete_blocks on public.availability_blocks
  for delete to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public)
values ('booking-references', 'booking-references', false)
on conflict (id) do nothing;

 drop policy if exists admins_read_reference_images on storage.objects;
create policy admins_read_reference_images on storage.objects
  for select to authenticated
  using (bucket_id = 'booking-references' and public.is_admin());

-- After creating the Auth user for the admin page, run:
-- insert into public.admin_users (user_id, email)
-- values ('AUTH_USER_UUID', 'admin@example.com');
