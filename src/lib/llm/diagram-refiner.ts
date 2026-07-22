import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Schema do grafo bpmn_migracao (ADR-006 §2.6). O LLM só produz/edita este
// JSON — nunca XML, posição ou cor (isso é papel do renderizador no planner-api).

const faseSchema = z.enum(["as_is", "convivencia", "to_be"]);

const laneSchema = z.object({
  id: z.string().describe("Identificador curto e estável da lane, ex.: 'origem'"),
  nome: z.string().describe("Nome exibido na lane, ex.: 'Oracle Retail Legacy (RMS)'"),
  papel: z.enum(["sistema_origem", "orquestracao", "api_backend", "destino_monitoramento"]),
  fases: z.array(faseSchema).describe("Fases em que a lane aparece"),
});

const noSchema = z.object({
  id: z.string().describe("Identificador curto e estável do nó, ex.: 'job_0002a'"),
  rotulo: z.string().describe("Texto exibido no nó; use \\n para quebrar linha"),
  lane: z.string().describe("id da lane onde o nó vive"),
  tipo: z.enum(["processo", "sistema", "artefato", "evento", "orquestrador", "nota"]),
  status: z.enum(["legado", "alvo", "neutro"]).describe("legado = amarelo, alvo = verde (fluxo novo), neutro = roxo"),
  coluna: z.number().int().min(0).describe("Posição esquerda→direita na lane (0 = primeira)"),
  fases: z.array(faseSchema),
  produzido_por: z
    .string()
    .nullable()
    .describe("Para tipo=artefato: id do nó que produz este artefato (fica ancorado abaixo dele)"),
  linha_inferior: z
    .boolean()
    .nullable()
    .describe("true para deslocar o nó para a linha de baixo da lane (evita cruzamento de rótulos)"),
  badge: z.number().int().nullable().describe("Número de sequência exibido ao lado do nó, ou null"),
});

const arestaSchema = z.object({
  de: z.string(),
  para: z.string(),
  rotulo: z.string().nullable().describe("Texto da seta (o 'TEXTO SETA' do discovery), ou null"),
  estilo: z.enum(["solida", "tracejada"]),
  cor: z.enum(["neutra", "verde"]).describe("verde = fluxo novo/alvo"),
  fases: z.array(faseSchema),
});

export const diagramGraphSchema = z.object({
  titulo: z.string(),
  tipo: z.literal("bpmn_migracao"),
  fases: z.array(faseSchema).min(1).describe("Fases que o diagrama cobre (páginas do arquivo)"),
  lanes: z.array(laneSchema),
  nos: z.array(noSchema),
  arestas: z.array(arestaSchema),
});

export type DiagramGraph = z.infer<typeof diagramGraphSchema>;

const refineResponseSchema = z.object({
  tipo_resposta: z
    .enum(["perguntas", "grafo"])
    .describe("'perguntas' quando houver ambiguidade a resolver ANTES de propor/alterar o grafo; 'grafo' quando o grafo foi criado/atualizado"),
  perguntas: z
    .array(z.string())
    .describe("Perguntas de esclarecimento ao arquiteto (vazio quando tipo_resposta='grafo' e nada ficou pendente)"),
  grafo: diagramGraphSchema.nullable().describe("O grafo completo atualizado, ou null se ainda só há perguntas"),
  resumo: z.string().describe("Resumo curto do que foi entendido/alterado nesta rodada, em português"),
});

export type DiagramRefineResponse = z.infer<typeof refineResponseSchema>;

export interface RefineTurn {
  papel: "usuario" | "assistente";
  texto: string;
}

export interface LaneDefinida {
  nome: string;
  papel: "sistema_origem" | "orquestracao" | "api_backend" | "destino_monitoramento";
}

export interface DiagramRefineInput {
  discovery: string;
  grafoAtual: DiagramGraph | null;
  historico: RefineTurn[];
  mensagem?: string;
  lanesDefinidas?: LaneDefinida[];
}

const SYSTEM_INSTRUCTIONS = `Você é o assistente de estruturação de diagramas do Escritório de Soluções de Arquitetura.

Sua única saída é um GRAFO ESTRUTURADO (lanes, nós, arestas) do tipo bpmn_migracao — você NUNCA gera XML, NUNCA decide posição em pixels e NUNCA escolhe cores. Um renderizador determinístico cuida do desenho.

## Formato do discovery
O arquiteto costuma mapear o fluxo como lista numerada. Convenções:
- Cada item numerado descreve um sistema, job, evento ou artefato (um NÓ), na ordem do fluxo.
- "TEXTO SETA: <rótulo>" indica que aquela parte é o RÓTULO DE UMA ARESTA, não um nó.
- Frases como "O Job gera o arquivo X" indicam um ARTEFATO produzido por aquele job (tipo=artefato, produzido_por=o job).
- O arquiteto pode esquecer a marcação TEXTO SETA — se uma linha puder ser tanto nó quanto aresta, PERGUNTE.

## Vocabulário do grafo
- Lanes (papel): sistema_origem (sistema de onde o fluxo parte), orquestracao (schedulers/orquestradores, ex.: Control-M), api_backend (camada de integração/APIs), destino_monitoramento (sistemas destino, diretórios de status, monitoração).
- Tipos de nó: processo (job/etapa), sistema (aplicação/plataforma), artefato (arquivo/documento gerado — sempre com produzido_por), evento (gatilho, ex.: "Fim do batch"), orquestrador (ex.: Control-M), nota (observação técnica).
- Status do nó: legado (fluxo atual), alvo (fluxo novo da solução), neutro (elemento reaproveitado/em transição).
- Fases: as_is (fluxo atual), convivencia (legado e novo em paralelo), to_be (estado final). Elementos compartilhados entre fases levam todas as fases em que aparecem — é UM grafo só, filtrado por fase.
- coluna: ordem esquerda→direita dentro da lane, seguindo a sequência do fluxo. Nós de fases diferentes na mesma lane podem reutilizar colunas.
- badge: numere a sequência principal de execução (1, 2, 3...) nos nós de processo quando a ordem for clara.
- linha_inferior: use em nós que recebem arestas com rótulos longos (ex.: diretório de status) para evitar cruzamento visual.

## Regras de comportamento (OBRIGATÓRIAS)
0. OS NOMES DAS LANES SÃO DECISÃO DO ARQUITETO, NUNCA SUA. Se o arquiteto forneceu a lista "Lanes definidas pelo arquiteto", use EXATAMENTE esses nomes e papéis — não crie lanes fora da lista, não renomeie, não abrevie. Se ele NÃO forneceu a lista e o discovery não nomeia as lanes explicitamente, sua primeira pergunta é quais lanes o diagrama deve ter (nome e papel de cada uma) — não batize lanes por conta própria a partir do texto.
1. AMBIGUIDADE → PERGUNTA. Se uma linha do discovery não deixa claro: se é nó ou aresta; em qual lane vive; qual o papel/tipo; qual fase; ou como se conecta — você PARA e pergunta (tipo_resposta='perguntas'). NUNCA invente ou infira silenciosamente o que não está no texto.
2. Você PODE devolver grafo parcial + perguntas: modele o que está claro (tipo_resposta='grafo') e liste em 'perguntas' o que ficou pendente.
3. NUNCA crie elementos "TBD" por conta própria. Só quando o arquiteto explicitamente disser que algo fica a definir.
4. NUNCA remova ou altere elementos do grafo atual que o arquiteto não pediu para mudar. Edições são incrementais sobre o grafo existente.
5. Só inclua as fases que o projeto realmente tem (um greenfield não tem as_is; um cutover direto não tem convivencia). Se não estiver claro quais fases o diagrama deve cobrir, pergunte.
6. Sempre devolva o grafo COMPLETO (não um diff) quando tipo_resposta='grafo'.
7. Responda 'resumo' e 'perguntas' sempre em português.`;

function buildUserMessage(input: DiagramRefineInput): string {
  const parts: string[] = [];
  parts.push("## Texto de discovery\n" + (input.discovery.trim() || "(não fornecido)"));
  if (input.lanesDefinidas && input.lanesDefinidas.length > 0) {
    const laneList = input.lanesDefinidas
      .map((lane) => `- "${lane.nome}" (papel: ${lane.papel})`)
      .join("\n");
    parts.push(
      "## Lanes definidas pelo arquiteto (use exatamente estas — nome e papel; não crie outras)\n" + laneList
    );
  } else {
    parts.push(
      "## Lanes definidas pelo arquiteto\n(nenhuma — se o discovery não nomear as lanes explicitamente, pergunte quais devem ser antes de criá-las)"
    );
  }
  if (input.grafoAtual) {
    parts.push("## Grafo atual (edições devem ser incrementais sobre ele)\n" + JSON.stringify(input.grafoAtual, null, 2));
  } else {
    parts.push("## Grafo atual\n(nenhum — primeira rodada)");
  }
  if (input.historico.length > 0) {
    const historyText = input.historico
      .map((turn) => `${turn.papel === "usuario" ? "Arquiteto" : "Assistente"}: ${turn.texto}`)
      .join("\n");
    parts.push("## Conversa de refinamento até aqui\n" + historyText);
  }
  if (input.mensagem?.trim()) {
    parts.push("## Nova mensagem do arquiteto\n" + input.mensagem.trim());
  }
  return parts.join("\n\n");
}

export async function refineDiagram(input: DiagramRefineInput): Promise<DiagramRefineResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 180_000 });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

  let message;
  try {
    message = await client.messages.parse({
      model,
      max_tokens: 32000,
      system: SYSTEM_INSTRUCTIONS,
      messages: [{ role: "user", content: buildUserMessage(input) }],
      output_config: {
        format: zodOutputFormat(refineResponseSchema),
      },
    });
  } catch (error) {
    throw new Error(
      "Falha ao refinar o diagrama: a resposta do modelo foi interrompida antes de terminar. Tente novamente.",
      { cause: error }
    );
  }

  if (!message.parsed_output) {
    throw new Error("O modelo não retornou uma resposta estruturada válida.");
  }
  return message.parsed_output;
}
