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
        "alternativas": [],
        "consequencias_positivas": [],
        "consequencias_negativas": [],
        "riscos": [],
        "lacunas_tecnicas": [],
        "itens_em_aberto": [],
        "proximos_passos": [],
        "pagina": 1,
        "total_paginas": 1,
        **artifact_data,
    }

    doc = DocxTemplate(template_path)
    doc.render(context)
    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.read()
