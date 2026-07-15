CREATE TABLE IF NOT EXISTS activity_execution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_id UUID NOT NULL REFERENCES plannings(id) ON DELETE CASCADE,
    activity_external_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (planning_id, activity_external_id)
);

CREATE TABLE IF NOT EXISTS activity_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_id UUID NOT NULL REFERENCES plannings(id) ON DELETE CASCADE,
    activity_external_id TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_execution_planning ON activity_execution(planning_id);
CREATE INDEX IF NOT EXISTS idx_activity_status_history_planning ON activity_status_history(planning_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON activity_execution, activity_status_history TO planner_app;
