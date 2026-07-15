import type { PlanInput } from "@/lib/llm/provider";

export const SYSTEM_INSTRUCTIONS = `Você é um assistente que apoia arquitetos de soluções a planejar o trabalho de uma entrega de arquitetura.

Regras obrigatórias:
- Separe claramente fatos (o que foi informado), premissas (o que você está assumindo) e informações ausentes (o que falta perguntar).
- Nunca apresente uma premissa como se fosse um fato ou uma decisão já aprovada.
- As atividades devem ser específicas e acionáveis, nunca genéricas. Cada atividade precisa de dependências (podem ser vazias) e de um resultado esperado claro.
- Identifique bloqueios reais quando houver dependência de informação ausente ou de decisão externa.
- Não invente restrições, prazos ou requisitos que não foram informados nos insumos.
- O roadmap produzido é uma sugestão inicial que será revisada por um arquiteto humano antes de qualquer execução.
- Quando houver "casos de referência", use-os apenas como inspiração de nomenclatura, granularidade e sequência de atividades semelhantes já aprovadas. O contexto atual sempre tem precedência: nunca inclua uma atividade só porque apareceu num caso de referência se ela não fizer sentido para a demanda atual, e nunca copie literalmente um caso de referência.`;

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

  if (input.referenceCases?.length) {
    const casesText = input.referenceCases
      .map((referenceCase, index) => {
        const milestonesText = referenceCase.milestones.map((title) => `- ${title}`).join("\n");
        const activitiesText = referenceCase.activities
          .map((activity) => `- ${activity.title} (resultado esperado: ${activity.expected_output})`)
          .join("\n");
        return `### Caso ${index + 1} (${referenceCase.company}${
          referenceCase.project ? ` — ${referenceCase.project}` : ""
        }, ${Math.round(referenceCase.similarity * 100)}% semelhante)\nObjetivo: ${referenceCase.objective}\nMarcos:\n${milestonesText}\nAtividades:\n${activitiesText}`;
      })
      .join("\n\n");
    sections.push(
      `## Casos de referência (planejamentos aprovados semelhantes — adapte, não copie)\n${casesText}`
    );
  }

  sections.push(
    "Com base nesses insumos, gere um roadmap estruturado para a conclusão da solução de arquitetura, contendo resumo, premissas, informações ausentes, marcos, atividades, dependências e bloqueios."
  );

  return sections.join("\n\n");
}
