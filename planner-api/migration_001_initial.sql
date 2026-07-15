CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS plannings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    title TEXT,
    solution_type TEXT,
    domain TEXT,
    technologies JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'generated'
        CHECK (status IN ('generated', 'in_review', 'reviewed', 'approved', 'archived')),
    context TEXT NOT NULL,
    objective TEXT NOT NULL,
    deliverables TEXT NOT NULL,
    constraints TEXT,
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planning_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_id UUID NOT NULL REFERENCES plannings(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    summary TEXT,
    assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
    missing_information JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by TEXT NOT NULL DEFAULT 'model',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (planning_id, version_number)
);

CREATE TABLE IF NOT EXISTS milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_version_id UUID NOT NULL REFERENCES planning_versions(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    objective TEXT NOT NULL,
    completion_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_version_id UUID NOT NULL REFERENCES planning_versions(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    milestone_external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    expected_output TEXT NOT NULL,
    dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL CHECK (status IN ('ready', 'blocked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blockers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_version_id UUID NOT NULL REFERENCES planning_versions(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    related_activity_external_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_plannings_company ON plannings(company_id);
CREATE INDEX IF NOT EXISTS idx_plannings_project ON plannings(project_id);
CREATE INDEX IF NOT EXISTS idx_plannings_status ON plannings(status);
CREATE INDEX IF NOT EXISTS idx_planning_versions_planning ON planning_versions(planning_id);
CREATE INDEX IF NOT EXISTS idx_milestones_version ON milestones(planning_version_id);
CREATE INDEX IF NOT EXISTS idx_activities_version ON activities(planning_version_id);
CREATE INDEX IF NOT EXISTS idx_blockers_version ON blockers(planning_version_id);

GRANT USAGE ON SCHEMA public TO planner_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO planner_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO planner_app;
