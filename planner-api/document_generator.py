import os
from io import BytesIO

from docxtpl import DocxTemplate

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")

DOCUMENT_TEMPLATES = {
    "documento_adr": os.path.join(TEMPLATES_DIR, "adr_template.docx"),
    "documento_int": os.path.join(TEMPLATES_DIR, "int_template.docx"),
}

REQUIRED_FIELDS = {
    "documento_adr": [
        "codigo",
        "titulo",
        "status",
        "data",
        "contexto",
        "decisao",
    ],
    "documento_int": [
        "codigo",
        "titulo",
        "status",
        "versao",
        "data",
        "objetivo",
    ],
}

DEFAULT_CONTEXT = {
    "documento_adr": {
        "dominio": "",
        "autores": "",
        "aprovadores": "",
        "subsecoes_contexto": [],
        "subsecoes_decisao": [],
        "alternativas": [],
        "opcao_a_nome": "",
        "opcao_b_nome": "",
        "tabela_comparativa": [],
        "fluxo_integracao": None,
        "consequencias_positivas": [],
        "consequencias_negativas": [],
        "riscos": [],
        "lacunas_tecnicas": [],
        "revisao_e_evolucao": "",
    },
    "documento_int": {
        "adr_referencia": "",
        "prazo_rollout": "",
        "solicitantes": "",
        "autores": "",
        "resumo_intro": "",
        "resumo_por_responsavel": [],
        "itens_em_aberto_intro": "",
        "itens_em_aberto": [],
        "pode_iniciar_intro": "",
        "pode_iniciar_agora": [],
        "itens_definidos": [],
        "proximos_passos": [],
        "proximos_passos_nota": "",
        "controle_versoes": [],
    },
}


def validate_artifact_data(activity_type, artifact_data):
    required = REQUIRED_FIELDS.get(activity_type, [])
    missing = [field for field in required if not artifact_data.get(field)]
    if missing:
        raise ValueError(f"Campos obrigatórios ausentes em artifact_data: {', '.join(missing)}")


def render_document(activity_type, artifact_data):
    template_path = DOCUMENT_TEMPLATES.get(activity_type)
    if not template_path:
        raise ValueError(f"Não há template de documento para activity_type '{activity_type}'")

    validate_artifact_data(activity_type, artifact_data)

    context = {
        "pagina": 1,
        "total_paginas": 1,
        **DEFAULT_CONTEXT.get(activity_type, {}),
        **artifact_data,
    }

    doc = DocxTemplate(template_path)
    doc.render(context, autoescape=True)
    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.read()
