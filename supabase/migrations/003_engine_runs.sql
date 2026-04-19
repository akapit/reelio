-- Engine pipeline tracking: one engine_runs row per generation job, with
-- child engine_steps rows capturing every step (vision analyze, plan,
-- scene prompt, per-scene i2v generation, merge, upload). Lets us debug,
-- replay, and improve runs over time.

create table if not exists engine_runs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  status text not null check (status in ('pending', 'running', 'done', 'failed')) default 'pending',
  -- Input config for the run: image urls, template name, music/voiceover
  -- toggles, user-requested model overrides, etc.
  input jsonb not null,
  -- Canonical summary of the run. Structure:
  -- {
  --   images: [{ url, analysis, rating, sceneRole, scenePrompt, model, sceneVideoUrl }],
  --   timeline: { templateName, sceneIds },
  --   merge: { sceneCount, totalDurationSec, outputUrl }
  -- }
  summary jsonb not null default '{}'::jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists engine_runs_asset_id_idx on engine_runs(asset_id);
create index if not exists engine_runs_user_id_created_at_idx on engine_runs(user_id, created_at desc);
create index if not exists engine_runs_status_idx on engine_runs(status);

create table if not exists engine_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references engine_runs(id) on delete cascade,
  step_order int not null,
  step_type text not null,
  status text not null check (status in ('running', 'done', 'failed')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  external_ids jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  error jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (run_id, step_order)
);

create index if not exists engine_steps_run_id_order_idx on engine_steps(run_id, step_order);
create index if not exists engine_steps_step_type_idx on engine_steps(step_type);

alter table engine_runs enable row level security;
alter table engine_steps enable row level security;

-- Users can read their own runs. Writes happen exclusively from the trigger
-- worker with the service-role key, which bypasses RLS.
create policy "engine_runs_select_own"
  on engine_runs for select
  using (auth.uid() = user_id);

create policy "engine_steps_select_own"
  on engine_steps for select
  using (
    exists (
      select 1 from engine_runs r
      where r.id = engine_steps.run_id
        and r.user_id = auth.uid()
    )
  );
