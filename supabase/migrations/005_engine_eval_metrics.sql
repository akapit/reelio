-- Promote two evaluator fields from the jsonb `output` blob to first-class
-- columns so we can filter, aggregate, and bucket failure modes with plain
-- SQL instead of jsonb path extraction. These mirror
-- `SceneQualityEvaluation.score` and `.issues` from the engine's evaluator.
-- Leaving them nullable because:
--   • `evaluateScenes: false` callers don't run the evaluator at all
--   • evaluator JSON parse failures land in `output.evaluation = null`
-- so NULL unambiguously means "no evaluation data" while a populated row
-- means the evaluator ran and returned a valid score.

alter table engine_scene_attempts
  add column if not exists evaluation_score numeric,
  add column if not exists evaluation_issues text[];

-- The typical query this enables: "across the last 100 runs, which issue
-- strings show up most often on Kling scenes?" — needs a GIN index on the
-- array to stay fast as the table grows.
create index if not exists engine_scene_attempts_evaluation_issues_idx
  on engine_scene_attempts using gin (evaluation_issues);

-- Lets us bucket "barely passed" (below floor) scenes vs. "comfortable pass"
-- scenes without re-parsing output jsonb.
create index if not exists engine_scene_attempts_evaluation_score_idx
  on engine_scene_attempts(evaluation_score)
  where evaluation_score is not null;
