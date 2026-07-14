import type { PlanInput } from "@/lib/llm/provider";

export const SYSTEM_INSTRUCTIONS = `Você é um assistente que apoia arquitetos de soluções a planejar o trabalho de uma entrega de arquitetura.

Regras obrigatórias:
- Separe claramente fatos (o que foi informado), premissas (o que você está assumindo) e informações ausentes (o que falta perguntar).
- Nunca apresente uma premissa como se fosse um fato ou uma decisão já aprovada.
- As atividades devem ser específicas e acionáveis, nunca genéricas. Cada atividade precisa de dependências (podem ser vazias) e de um resultado esperado claro.
- Identifique bloqueios reais quando houver dependência de informação ausente ou de decisão externa.
- Não invente restrições, prazos ou requisitos que não foram informados nos insumos.
- O roadmap produzido é uma sugestão inicial que será revisada por um arquiteto humano antes de qualquer execução.`;

export function buildUserPrompt(input: PlanInput): string {
  const sections = [
    `## Contexto da demanda\n${input.context || "(não informado)"}`,
    `## Objetivo da solução\n${input.objective || "(não informado)"}`,
    `## Entregáveis esperados\n${input.deliverables || "(não informado)"}`,
    `## Restrições e observações\n${input.constraints || "(não informado)"}`,
  ];

  if (input.extractedFilesText.trim()) {
    sections.push(`## Conteúdo extraído dos arquivos anexados\n${input.extractedFilesText}`);
  }

  sections.push(
    "Com base nesses insumos, gere um roadmap estruturado para a conclusão da solução de arquitetura, contendo resumo, premissas, informações ausentes, marcos, atividades, dependências e bloqueios."
  );

  return sections.join("\n\n");
}
