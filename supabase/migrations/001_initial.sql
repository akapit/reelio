create table profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  avatar_url text,
  plan text default 'free',
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  property_address text,
  status text default 'active',
  created_at timestamptz default now()
);
alter table projects enable row level security;
create policy "Users manage own projects"
  on projects for all using (auth.uid() = user_id);

create table assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  original_url text not null,
  processed_url text,
  asset_type text not null check (asset_type in ('image','video')),
  status text default 'uploaded'
    check (status in ('uploaded','processing','done','failed')),
  job_id text,
  tool_used text check (tool_used in ('enhance','staging','sky','video')),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
alter table assets enable row level security;
create policy "Users manage own assets"
  on assets for all using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), coalesce(new.raw_user_meta_data->>'avatar_url', ''));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
