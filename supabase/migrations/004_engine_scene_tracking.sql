-- Normalize scene-level tracking so every planned scene and generation attempt
-- has a durable row the app can inspect directly.

create table if not exists engine_scenes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references engine_runs(id) on delete cascade,
  scene_id text not null,
  scene_order int not null,
  slot_id text not null,
  status text not null check (status in ('pending', 'running', 'done', 'failed')) default 'pending',
  image_path text not null,
  room_type text not null,
  scene_role text not null,
  duration_sec double precision not null,
  motion_intent text,
  overlay_text text,
  transition_out text,
  transition_duration_sec double precision,
  planner jsonb not null default '{}'::jsonb,
  prompt jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, scene_id),
  unique (run_id, scene_order)
);

create index if not exists engine_scenes_run_id_order_idx on engine_scenes(run_id, scene_order);
create index if not exists engine_scenes_run_id_status_idx on engine_scenes(run_id, status);

create table if not exists engine_scene_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references engine_runs(id) on delete cascade,
  scene_record_id uuid not null references engine_scenes(id) on delete cascade,
  attempt_order int not null,
  status text not null check (status in ('running', 'done', 'failed')) default 'running',
  provider text,
  model_choice text,
  prompt jsonb not null default '{}'::jsonb,
  external_ids jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (scene_record_id, attempt_order)
);

create index if not exists engine_scene_attempts_run_id_idx on engine_scene_attempts(run_id);
create index if not exists engine_scene_attempts_scene_record_id_idx on engine_scene_attempts(scene_record_id);

create table if not exists engine_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references engine_runs(id) on delete cascade,
  scene_record_id uuid references engine_scenes(id) on delete cascade,
  attempt_id uuid references engine_scene_attempts(id) on delete cascade,
  level text not null check (level in ('info', 'warn', 'error')) default 'info',
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists engine_events_run_id_created_at_idx on engine_events(run_id, created_at desc);
create index if not exists engine_events_scene_record_id_idx on engine_events(scene_record_id);
create index if not exists engine_events_attempt_id_idx on engine_events(attempt_id);

create or replace function set_engine_scenes_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists engine_scenes_set_updated_at on engine_scenes;
create trigger engine_scenes_set_updated_at
before update on engine_scenes
for each row execute procedure set_engine_scenes_updated_at();

alter table engine_scenes enable row level security;
alter table engine_scene_attempts enable row level security;
alter table engine_events enable row level security;

create policy "engine_scenes_select_own"
  on engine_scenes for select
  using (
    exists (
      select 1 from engine_runs r
      where r.id = engine_scenes.run_id
        and r.user_id = auth.uid()
    )
  );

create policy "engine_scene_attempts_select_own"
  on engine_scene_attempts for select
  using (
    exists (
      select 1 from engine_runs r
      where r.id = engine_scene_attempts.run_id
        and r.user_id = auth.uid()
    )
  );

create policy "engine_events_select_own"
  on engine_events for select
  using (
    exists (
      select 1 from engine_runs r
      where r.id = engine_events.run_id
        and r.user_id = auth.uid()
    )
  );
