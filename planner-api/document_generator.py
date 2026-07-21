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

# Row background colors extracted from the real RFID-INT-001.docx
STATUS_COLORS = {
    "PENDENTE": "FDECEA",
    "PARCIAL": "FFF3CD",
    "DEFINIDO": "E8F5E9",
}
DEFAULT_ROW_COLOR = "FFFFFF"

DEFAULT_CONTEXT = {
    "documento_adr": {
        "dominio": "",
        "autores": "",
        "aprovadores": "",
        "subsecoes_contexto": [],
        "subsecoes_decisao": [],
        "alternativas": [],
        "opcao_a_nome": "Opção A",
        "opcao_b_nome": "Opção B",
        "tabela_comparativa": [],
        "fluxo_nome": "",
        "fluxo_intro": "",
        "fluxo_passos": [],
        "fluxo_subsecoes": [],
        "consequencias_positivas": [],
        "consequencias_negativas": [],
        "riscos": [],
        "lacunas_intro": "As seguintes informações ainda precisam ser confirmadas antes da implementação:",
        "lacunas_tecnicas": [],
        "revisao_intro": "Esta ADR deve ser revisada nos seguintes eventos:",
        "revisao_e_evolucao": [],
    },
    "documento_int": {
        "adr_referencia": "",
        "prazo_rollout": "",
        "solicitantes": "",
        "autores": "",
        "resumo_por_responsavel": [],
        "itens_em_aberto": [],
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


def _normalize(activity_type, context):
    # Footer label defaults to the document title
    if not context.get("titulo_rodape"):
        context["titulo_rodape"] = context.get("titulo", "")

    if activity_type == "documento_int":
        # Inject the status row color used by the template's {% cellbg %} tags
        for item in context.get("itens_em_aberto", []) or []:
            if isinstance(item, dict) and not item.get("cor"):
                status = str(item.get("status", "")).strip().upper()
                item["cor"] = STATUS_COLORS.get(status, DEFAULT_ROW_COLOR)

    if activity_type == "documento_adr":
        # Accept a plain string for revisao_e_evolucao (older payloads)
        value = context.get("revisao_e_evolucao")
        if isinstance(value, str):
            context["revisao_e_evolucao"] = [value] if value else []

    return context


def render_document(activity_type, artifact_data):
    template_path = DOCUMENT_TEMPLATES.get(activity_type)
    if not template_path:
        raise ValueError(f"Não há template de documento para activity_type '{activity_type}'")

    validate_artifact_data(activity_type, artifact_data)

    context = {
        **DEFAULT_CONTEXT.get(activity_type, {}),
        **artifact_data,
    }
    context = _normalize(activity_type, context)

    doc = DocxTemplate(template_path)
    doc.render(context, autoescape=True)
    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.read()
