ALTER TABLE planning_versions ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS activity_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_version_id UUID NOT NULL REFERENCES planning_versions(id) ON DELETE CASCADE,
    activity_external_id TEXT NOT NULL,
    classification TEXT NOT NULL CHECK (classification IN ('fez_sentido', 'parcial', 'nao_fez_sentido')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (planning_version_id, activity_external_id)
);

CREATE TABLE IF NOT EXISTS planning_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_version_id UUID NOT NULL UNIQUE REFERENCES planning_versions(id) ON DELETE CASCADE,
    utility_score INTEGER NOT NULL CHECK (utility_score BETWEEN 1 AND 5),
    coverage_score INTEGER NOT NULL CHECK (coverage_score BETWEEN 1 AND 5),
    sequence_quality_score INTEGER NOT NULL CHECK (sequence_quality_score BETWEEN 1 AND 5),
    detail_level_score INTEGER NOT NULL CHECK (detail_level_score BETWEEN 1 AND 5),
    objective_adherence_score INTEGER NOT NULL CHECK (objective_adherence_score BETWEEN 1 AND 5),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS change_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_id UUID NOT NULL REFERENCES plannings(id) ON DELETE CASCADE,
    from_version_number INTEGER,
    to_version_number INTEGER NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('activity', 'milestone')),
    external_id TEXT,
    action TEXT NOT NULL CHECK (action IN ('accepted_unchanged', 'edited', 'removed', 'added', 'moved')),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_feedback_version ON activity_feedback(planning_version_id);
CREATE INDEX IF NOT EXISTS idx_change_events_planning ON change_events(planning_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON activity_feedback, planning_feedback, change_events TO planner_app;
