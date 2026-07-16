-- migration_008_timesheet.sql
-- Módulo timesheet (MVP). Ver ADRs 0008–0018 do repositório timesheet.
--
-- Estratégia (ADR-0018, opção incremental): estas tabelas referenciam as entidades de
-- núcleo ONDE ELAS JÁ ESTÃO HOJE (public.companies, public.projects, public.users,
-- public.activity_execution). A separação em schema `core` e a normalização/dedup do
-- Registro Service (ADR-0013) são passos planejados à parte — NÃO fazem parte desta
-- migration para não refatorar o planejador agora.

-- --------------------------------------------------------------------------------------
-- Entitlement do módulo (ADR-0010 / ADR-0016)
--   Perfil A = app_shell_access AND timesheet_enabled   (vê o timesheet no menu)
--   Perfil B = app_shell_access AND NOT timesheet_enabled
--   Perfil C = NOT app_shell_access AND timesheet_enabled  (timesheet-only)
-- --------------------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS timesheet_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS app_shell_access  BOOLEAN NOT NULL DEFAULT TRUE;

-- --------------------------------------------------------------------------------------
-- Lançamento de horas (ADR-0012). Uma linha por (pessoa, dia, empresa/projeto).
-- As horas são do CONJUNTO de atividades da linha; a grade semanal (ADR-0014) agrupa
-- estas linhas por semana na apresentação. project_id NULL = lançamento no nível empresa
-- (ADR-0017).
-- --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_date  DATE NOT NULL,
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    project_id  UUID REFERENCES projects(id) ON DELETE RESTRICT,
    hours       NUMERIC(4,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- Regra "hours>0 AND (>=1 atividade OU note)" (ADR-0017): a parte que cruza a
    -- tabela-filha é validada na aplicação (não expressável como CHECK simples).
);

-- Conjunto de atividades de um lançamento (modo com planejador — ADR-0011/0012).
-- Referencia a IDENTIDADE de execução (planning_id, activity_external_id), estável entre
-- versões do planejamento. A elegibilidade (doing/done, nunca todo) é garantida na
-- seleção, lendo activity_execution.status.
CREATE TABLE IF NOT EXISTS time_entry_activities (
    time_entry_id        UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
    planning_id          UUID NOT NULL,
    activity_external_id TEXT NOT NULL,
    PRIMARY KEY (time_entry_id, planning_id, activity_external_id),
    FOREIGN KEY (planning_id, activity_external_id)
        REFERENCES activity_execution(planning_id, activity_external_id) ON DELETE CASCADE
    -- CASCADE: se a atividade de execução some (ex.: planejamento apagado), o vínculo cai,
    -- mas o lançamento (horas + note) permanece como histórico.
);

-- Atribuição de acesso para o modo SEM planejador (ADR-0013). No modo com planejador o
-- acesso é implícito (trabalhou → pode lançar). project_id NULL = empresa inteira.
CREATE TABLE IF NOT EXISTS timesheet_access (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Unicidade tratando project_id NULL (empresa inteira) de forma idiomática no Postgres.
CREATE UNIQUE INDEX IF NOT EXISTS uq_timesheet_access_project
    ON timesheet_access (user_id, company_id, project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_timesheet_access_company
    ON timesheet_access (user_id, company_id) WHERE project_id IS NULL;

-- Fechamento/bloqueio de período (ADR-0012). Trava lançamentos anteriores à data.
CREATE TABLE IF NOT EXISTS timesheet_period_locks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    locked_before DATE NOT NULL,
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------------------------
-- Índices
-- --------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON time_entries(user_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_company   ON time_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project   ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_tea_activity           ON time_entry_activities(planning_id, activity_external_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_access_user  ON timesheet_access(user_id);

-- --------------------------------------------------------------------------------------
-- Permissões (mesma role da aplicação)
-- --------------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE
    ON time_entries, time_entry_activities, timesheet_access, timesheet_period_locks
    TO planner_app;
