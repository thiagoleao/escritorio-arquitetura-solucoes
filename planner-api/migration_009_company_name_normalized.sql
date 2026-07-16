-- migration_009_company_name_normalized.sql
-- Apoio ao Registro Service (ADR-0020): normalização + busca de similares para dedup
-- soft de empresas. NÃO cria UNIQUE rígido — a deduplicação é não-bloqueante (ADR-0013),
-- com merge como ferramenta de admin.
--
-- Este arquivo é aditivo e NÃO toca em main.py. A extração do registry.py e os endpoints
-- de resolução são os passos seguintes da ADR-0020.

-- Extensões (criadas pela role de migration, como em migration_001/pgcrypto)
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Função de normalização — fonte ÚNICA da regra, reutilizada no backfill, no trigger e
-- nas queries de resolução do Registro Service.
--   lower + unaccent + trim + colapso de espaços internos.
-- STABLE (não IMMUTABLE) porque unaccent depende do dicionário; por isso o valor é
-- MATERIALIZADO na coluna name_normalized (não é índice de expressão sobre a função).
CREATE OR REPLACE FUNCTION normalize_name(txt TEXT)
RETURNS TEXT AS $$
    SELECT lower(trim(regexp_replace(unaccent(COALESCE(txt, '')), '\s+', ' ', 'g')));
$$ LANGUAGE sql STABLE;

-- Coluna materializada
ALTER TABLE companies ADD COLUMN IF NOT EXISTS name_normalized TEXT;

-- Backfill das linhas existentes
UPDATE companies SET name_normalized = normalize_name(name) WHERE name_normalized IS NULL;

-- A partir daqui a coluna é sempre preenchida
ALTER TABLE companies ALTER COLUMN name_normalized SET NOT NULL;

-- Trigger para manter name_normalized consistente em qualquer INSERT/UPDATE de name,
-- independentemente de a aplicação lembrar de preencher (defesa em profundidade).
CREATE OR REPLACE FUNCTION companies_set_name_normalized()
RETURNS TRIGGER AS $$
BEGIN
    NEW.name_normalized := normalize_name(NEW.name);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_companies_name_normalized ON companies;
CREATE TRIGGER trg_companies_name_normalized
    BEFORE INSERT OR UPDATE OF name ON companies
    FOR EACH ROW EXECUTE FUNCTION companies_set_name_normalized();

-- Índices:
--  - btree para lookup exato pelo normalizado (resolução "já existe com esse nome?")
--  - gin trigram para busca de SIMILARES (sugestões de dedup soft)
CREATE INDEX IF NOT EXISTS idx_companies_name_normalized      ON companies (name_normalized);
CREATE INDEX IF NOT EXISTS idx_companies_name_normalized_trgm ON companies USING gin (name_normalized gin_trgm_ops);

-- Obs.: projects segue o mesmo padrão quando o resolveProject entrar (escopo por
-- company_id já reduz colisão); fica como extensão natural desta migration.
