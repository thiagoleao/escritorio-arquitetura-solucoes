CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planning_version_id UUID NOT NULL UNIQUE REFERENCES planning_versions(id) ON DELETE CASCADE,
    embedding vector(1536) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sem índice ivfflat por enquanto: com poucas linhas o recall fica ruim
-- (o próprio Postgres avisa "ivfflat index created with little data").
-- Sequential scan é rápido o suficiente na escala atual. Adicionar
-- `CREATE INDEX ... USING ivfflat (embedding vector_cosine_ops) WITH (lists = N)`
-- (N ~ sqrt(linhas)) quando a tabela `embeddings` tiver centenas/milhares de linhas.

GRANT SELECT, INSERT, UPDATE, DELETE ON embeddings TO planner_app;
