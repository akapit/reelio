-- AI enhancement presets — pre-defined prompt/model/params for the photo
-- enhancement modal. Source-of-truth seed lives here; rows can be tweaked
-- in production via SQL without redeploying.

create table if not exists ai_enhancement_presets (
  key text primary key,
  prompt text not null,
  model text not null default 'openai/gpt-image-2.0',
  params jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table ai_enhancement_presets enable row level security;

drop policy if exists "presets readable by authenticated" on ai_enhancement_presets;
create policy "presets readable by authenticated"
  on ai_enhancement_presets for select to authenticated using (true);

insert into ai_enhancement_presets (key, prompt, sort_order) values
  ('quality',   'Enhance this real-estate photo: improve natural lighting, color balance, sharpness, and dynamic range. Keep the scene composition exactly the same. Photorealistic.', 10),
  ('expand',    'Outpaint this real-estate photo by ~25 percent on all sides. Extend the room realistically, matching existing materials, light direction, perspective, and depth of field. Do not invent new furniture inside the original frame.', 20),
  ('rearrange', 'Keep the same room walls, floor, ceiling, and windows exactly. Rearrange the existing furniture into a more spacious, professionally staged layout. Photorealistic interior design.', 30),
  ('clean',     'Remove clutter, personal items, cables, signage, and visible mess from this real-estate photo. Preserve all walls, fixtures, and structural furniture. Photorealistic.', 40),
  ('refurnish', 'Replace existing furniture with modern, neutral, professionally staged real-estate furniture. Keep the same room geometry, walls, flooring, windows, and lighting direction.', 50)
on conflict (key) do nothing;
