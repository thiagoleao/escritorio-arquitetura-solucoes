"""Registro Service (ADR-0020): via única de escrita de empresas/projetos.

Toda criação/resolução de empresa e projeto passa por aqui. Planejador e timesheet
consomem estas funções (o timesheet via os endpoints HTTP de resolução em main.py). A
normalização usa a função SQL normalize_name() (migration_009), fonte única da regra —
por isso estas funções exigem a migration_009 aplicada antes do deploy.

Contrato de retorno: (id_or_None, status, suggestions)
  status ∈ {"matched", "absent", "created", "empty"}
    matched  -> já existia (por nome normalizado)
    absent   -> não existe e NÃO foi criado (create=False); suggestions traz similares
    created  -> não existia e foi criado (create=True)
    empty    -> nome vazio (só projetos; empresa vazia levanta erro)
"""

# Limiar trigram para sugerir possíveis duplicatas (dedup soft, não bloqueante — ADR-0013).
SIMILARITY_THRESHOLD = 0.4


def _company_suggestions(cursor, name):
    """Empresas parecidas por trigram sobre o nome normalizado (sugestões de dedup)."""
    cursor.execute(
        """
        SELECT id, name, similarity(name_normalized, normalize_name(%s)) AS score
        FROM companies
        WHERE similarity(name_normalized, normalize_name(%s)) >= %s
        ORDER BY score DESC
        LIMIT 5
        """,
        (name, name, SIMILARITY_THRESHOLD),
    )
    return cursor.fetchall()


def resolve_company(cursor, name, create=False):
    """Resolve uma empresa por nome normalizado. Ver contrato no topo do módulo."""
    clean = (name or "").strip()
    if not clean:
        raise ValueError("company name is required")

    cursor.execute(
        "SELECT id FROM companies WHERE name_normalized = normalize_name(%s)",
        (clean,),
    )
    row = cursor.fetchone()
    if row:
        return row["id"], "matched", []

    suggestions = _company_suggestions(cursor, clean)
    if not create:
        return None, "absent", suggestions

    cursor.execute("INSERT INTO companies (name) VALUES (%s) RETURNING id", (clean,))
    return cursor.fetchone()["id"], "created", suggestions


def resolve_project(cursor, company_id, name, create=False):
    """Resolve um projeto dentro de uma empresa.

    projects ainda não tem name_normalized (extensão futura da migration_009); por ora a
    resolução é por lower(trim(name)) no escopo da empresa, sem sugestões trigram.
    """
    clean = (name or "").strip()
    if not clean:
        return None, "empty", []

    cursor.execute(
        "SELECT id FROM projects WHERE company_id = %s AND lower(trim(name)) = lower(%s)",
        (company_id, clean),
    )
    row = cursor.fetchone()
    if row:
        return row["id"], "matched", []

    if not create:
        return None, "absent", []

    cursor.execute(
        "INSERT INTO projects (company_id, name) VALUES (%s, %s) RETURNING id",
        (company_id, clean),
    )
    return cursor.fetchone()["id"], "created", []
