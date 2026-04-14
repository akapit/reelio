-- Persist a link from a generated asset back to its source asset, so we can
-- show the source image when reviewing a past generation and re-run with it.
alter table assets
  add column if not exists source_asset_id uuid references assets(id) on delete set null;

create index if not exists assets_source_asset_id_idx on assets(source_asset_id);

-- The existing `metadata` jsonb column already exists; we'll write the
-- generation config (prompt, model, duration, voiceover, music, etc.) into it
-- at /api/process time. No schema change needed for that.
