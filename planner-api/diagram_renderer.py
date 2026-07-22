"""Renderizador determinístico de diagramas .drawio (ADR-006 §2.4/§2.6).

Converte o grafo estruturado (tipo `bpmn_migracao`) em XML compatível com
draw.io. O LLM nunca chega perto deste módulo: cores, formas, tamanhos e
posições vêm exclusivamente do dicionário de estilo fixo (extraído do arquivo
de referência real da CEA) e da heurística de layout abaixo.

Layout: lanes horizontais empilhadas na ordem declarada; nó posicionado pela
sua `coluna` (esquerda → direita); artefato ancorado logo abaixo do nó que o
produz; arestas com roteamento ortogonal delegado ao draw.io (sem waypoints).
Uma página por fase — cada página é o grafo filtrado por aquela fase.
"""
from xml.sax.saxutils import escape, quoteattr

VALID_PHASES = ["as_is", "convivencia", "to_be"]
PHASE_NAMES = {"as_is": "AS IS", "convivencia": "Convivência", "to_be": "TO BE"}

LANE_STYLES = {
    "sistema_origem": "swimlane;startSize=23;html=1;collapsible=0;horizontal=0;fontStyle=1;fillColor=#E1F5FE;strokeColor=#0288D1;",
    "orquestracao": "swimlane;startSize=23;html=1;collapsible=0;horizontal=0;fontStyle=1;fillColor=#F5F5F5;strokeColor=#616161;",
    "api_backend": "swimlane;startSize=23;html=1;collapsible=0;horizontal=0;fontStyle=1;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;",
    "destino_monitoramento": "swimlane;startSize=23;html=1;collapsible=0;horizontal=0;fontStyle=1;fillColor=#EDE7F6;strokeColor=#5E35B1;",
}

NODE_COLORS = {
    "legado": ("#fff2cc", "#d6b656"),
    "alvo": ("#d5e8d4", "#82b366"),
    "neutro": ("#e1d5e7", "#9673a6"),
}

BADGE_STYLES = {
    "legado": "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#f0a30a;strokeColor=none;fontColor=#000000;shadow=1;",
    "alvo": "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#0050ef;strokeColor=none;fontColor=#ffffff;shadow=1;",
    "neutro": "ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#0050ef;strokeColor=none;fontColor=#ffffff;shadow=1;",
}

NODE_SIZES = {
    "processo": (160, 60),
    "sistema": (190, 65),
    "artefato": (170, 100),
    "evento": (100, 60),
    "orquestrador": (170, 70),
    "nota": (220, 100),
}

LANE_X = 40
LANE_TITLE_Y = 40
LANE_START_Y = 100
COLUMN_STEP = 280
COLUMN_MARGIN = 60
NODE_ROW_Y = 30
ARTIFACT_ROW_Y = 120
LANE_HEIGHT_SIMPLE = 140
LANE_HEIGHT_WITH_ARTIFACTS = 250
MIN_LANE_WIDTH = 900


def _node_style(node):
    tipo = node["tipo"]
    if tipo == "nota":
        return "rounded=0;whiteSpace=wrap;html=1;fillColor=#f5f5f5;fontColor=#333333;strokeColor=none;shadow=1;fontSize=11;"
    fill, stroke = NODE_COLORS[node.get("status", "legado")]
    shadow = "shadow=1;" if node.get("status") == "alvo" else ""
    if tipo in ("processo", "sistema"):
        return f"rounded=1;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};fontStyle=1;{shadow}"
    if tipo == "artefato":
        return f"shape=document;whiteSpace=wrap;html=1;boundedLbl=1;fillColor={fill};strokeColor={stroke};fontSize=11;"
    if tipo == "evento":
        return f"ellipse;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};fontStyle=1;"
    if tipo == "orquestrador":
        return f"shape=hexagon;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};fontStyle=1;"
    raise ValueError(f"Tipo de nó desconhecido: '{tipo}'")


def _edge_style(edge):
    style = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;"
    if edge.get("estilo") == "tracejada":
        style += "dashed=1;"
    if edge.get("cor") == "verde":
        style += "fillColor=#d5e8d4;strokeColor=#82b366;"
    return style


def _in_phase(element, phase):
    fases = element.get("fases")
    if not fases:
        return True
    return phase in fases


def validate_graph(graph):
    if graph.get("tipo") != "bpmn_migracao":
        raise ValueError(f"Tipo de diagrama não suportado: '{graph.get('tipo')}'. Suportado: bpmn_migracao")

    fases = graph.get("fases") or []
    invalid = [f for f in fases if f not in VALID_PHASES]
    if invalid:
        raise ValueError(f"Fases inválidas: {invalid}. Válidas: {VALID_PHASES}")
    if not fases:
        raise ValueError("O grafo precisa declarar ao menos uma fase")

    lane_ids = set()
    for lane in graph.get("lanes", []):
        if lane.get("papel") not in LANE_STYLES:
            raise ValueError(f"Papel de lane desconhecido: '{lane.get('papel')}'. Válidos: {sorted(LANE_STYLES)}")
        if lane["id"] in lane_ids:
            raise ValueError(f"Lane duplicada: '{lane['id']}'")
        lane_ids.add(lane["id"])

    node_ids = set()
    for node in graph.get("nos", []):
        if node["id"] in node_ids:
            raise ValueError(f"Nó duplicado: '{node['id']}'")
        node_ids.add(node["id"])
        if node.get("lane") not in lane_ids:
            raise ValueError(f"Nó '{node['id']}' referencia lane inexistente: '{node.get('lane')}'")
        if node.get("tipo") not in NODE_SIZES:
            raise ValueError(f"Nó '{node['id']}' tem tipo desconhecido: '{node.get('tipo')}'. Válidos: {sorted(NODE_SIZES)}")
        if node.get("tipo") != "nota" and node.get("status", "legado") not in NODE_COLORS:
            raise ValueError(f"Nó '{node['id']}' tem status desconhecido: '{node.get('status')}'. Válidos: {sorted(NODE_COLORS)}")
        produced = node.get("produzido_por")
        if produced and produced not in {n["id"] for n in graph.get("nos", [])}:
            raise ValueError(f"Nó '{node['id']}' referencia produzido_por inexistente: '{produced}'")

    for edge in graph.get("arestas", []):
        for endpoint in (edge.get("de"), edge.get("para")):
            if endpoint not in node_ids:
                raise ValueError(f"Aresta referencia nó inexistente: '{endpoint}'")


def _render_page(graph, phase, page_index):
    lanes = [l for l in graph.get("lanes", []) if _in_phase(l, phase)]
    nodes = [n for n in graph.get("nos", []) if _in_phase(n, phase)]
    visible_node_ids = {n["id"] for n in nodes}
    # nó só entra se a lane dele estiver visível nesta fase
    visible_lane_ids = {l["id"] for l in lanes}
    nodes = [n for n in nodes if n["lane"] in visible_lane_ids]
    visible_node_ids = {n["id"] for n in nodes}
    edges = [
        e for e in graph.get("arestas", [])
        if _in_phase(e, phase) and e["de"] in visible_node_ids and e["para"] in visible_node_ids
    ]

    nodes_by_id = {n["id"]: n for n in nodes}
    nodes_by_lane = {}
    for node in nodes:
        nodes_by_lane.setdefault(node["lane"], []).append(node)

    max_column = 0
    for node in nodes:
        anchor = node
        if node.get("produzido_por") and node["produzido_por"] in nodes_by_id:
            anchor = nodes_by_id[node["produzido_por"]]
        max_column = max(max_column, int(anchor.get("coluna", 0)))
    lane_width = max(MIN_LANE_WIDTH, COLUMN_MARGIN + (max_column + 1) * COLUMN_STEP + 60)

    cells = []
    prefix = f"p{page_index}"

    # Título da página (como no arquivo real: texto grande acima das lanes)
    title = graph.get("titulo", "")
    if title:
        cells.append(
            f'<mxCell id="{prefix}-title" value={quoteattr(escape(title))} '
            f'style="text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;rounded=0;fontSize=28;fontStyle=1" '
            f'vertex="1" parent="1"><mxGeometry x="{LANE_X}" y="{LANE_TITLE_Y}" width="{lane_width}" height="40" as="geometry" /></mxCell>'
        )

    # Lanes empilhadas
    lane_geometry = {}
    y_cursor = LANE_START_Y
    for lane in lanes:
        lane_nodes = nodes_by_lane.get(lane["id"], [])
        has_artifacts = any(n.get("produzido_por") or n.get("linha_inferior") for n in lane_nodes)
        has_tall = any(n["tipo"] == "nota" for n in lane_nodes)
        height = LANE_HEIGHT_WITH_ARTIFACTS if (has_artifacts or has_tall) else LANE_HEIGHT_SIMPLE
        lane_cell_id = f"{prefix}-lane-{lane['id']}"
        cells.append(
            f'<mxCell id="{lane_cell_id}" value={quoteattr(escape(lane["nome"]))} '
            f'style="{LANE_STYLES[lane["papel"]]}" vertex="1" parent="1">'
            f'<mxGeometry x="{LANE_X}" y="{y_cursor}" width="{lane_width}" height="{height}" as="geometry" /></mxCell>'
        )
        lane_geometry[lane["id"]] = lane_cell_id
        y_cursor += height

    # Nós
    node_cell_ids = {}
    for node in nodes:
        width, height = NODE_SIZES[node["tipo"]]
        producer = nodes_by_id.get(node.get("produzido_por") or "")
        if producer is not None:
            column = int(producer.get("coluna", 0))
            x = COLUMN_MARGIN + column * COLUMN_STEP
            y = ARTIFACT_ROW_Y
        else:
            column = int(node.get("coluna", 0))
            x = COLUMN_MARGIN + column * COLUMN_STEP
            # linha_inferior: nó deslocado para a linha de baixo da lane (como o
            # "Diretório de Status" do arquivo real), evitando cruzamento de rótulos
            y = ARTIFACT_ROW_Y if node.get("linha_inferior") else NODE_ROW_Y
        cell_id = f"{prefix}-no-{node['id']}"
        node_cell_ids[node["id"]] = cell_id
        cells.append(
            f'<mxCell id="{cell_id}" value={quoteattr(escape(node["rotulo"]))} '
            f'style="{_node_style(node)}" vertex="1" parent="{lane_geometry[node["lane"]]}">'
            f'<mxGeometry x="{x}" y="{y}" width="{width}" height="{height}" as="geometry" /></mxCell>'
        )
        badge = node.get("badge")
        if badge is not None:
            badge_style = BADGE_STYLES[node.get("status", "legado")]
            bx = x + width + 20
            cells.append(
                f'<mxCell id="{cell_id}-badge" value={quoteattr(escape(str(badge)))} '
                f'style="{badge_style}" vertex="1" parent="{lane_geometry[node["lane"]]}">'
                f'<mxGeometry x="{bx}" y="{y + 10}" width="55" height="55" as="geometry" /></mxCell>'
            )

    # Arestas (roteamento ortogonal delegado ao draw.io)
    for i, edge in enumerate(edges):
        edge_id = f"{prefix}-aresta-{i}"
        cells.append(
            f'<mxCell id="{edge_id}" style="{_edge_style(edge)}" edge="1" parent="1" '
            f'source="{node_cell_ids[edge["de"]]}" target="{node_cell_ids[edge["para"]]}">'
            f'<mxGeometry relative="1" as="geometry" /></mxCell>'
        )
        label = edge.get("rotulo")
        if label:
            cells.append(
                f'<mxCell id="{edge_id}-rotulo" value={quoteattr(escape(label))} '
                f'style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];" '
                f'vertex="1" connectable="0" parent="{edge_id}">'
                f'<mxGeometry relative="1" as="geometry"><mxPoint as="offset" /></mxGeometry></mxCell>'
            )

    page_height = y_cursor + 100
    page_width = lane_width + 2 * LANE_X
    return (
        f'<diagram name="{PHASE_NAMES[phase]}" id="{prefix}">'
        f'<mxGraphModel dx="1000" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" '
        f'arrows="1" fold="1" page="1" pageScale="1" pageWidth="{page_width}" pageHeight="{page_height}" math="0" shadow="0">'
        f'<root><mxCell id="0" /><mxCell id="1" parent="0" />'
        + "".join(cells)
        + "</root></mxGraphModel></diagram>"
    )


def render_diagram(graph):
    """Grafo estruturado → bytes do arquivo .drawio (uma página por fase)."""
    validate_graph(graph)
    pages = [
        _render_page(graph, phase, i)
        for i, phase in enumerate(f for f in VALID_PHASES if f in graph["fases"])
    ]
    xml = '<mxfile host="Escritório de Soluções" type="device">' + "".join(pages) + "</mxfile>"
    return xml.encode("utf-8")
