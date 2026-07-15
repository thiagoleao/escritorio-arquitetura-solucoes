interface EmbeddingTextInput {
  context: string;
  objective: string;
  deliverables: string;
  constraints?: string | null;
  milestones: Array<{ title: string; objective: string }>;
  activities: Array<{ title: string; description: string }>;
}

export function buildEmbeddingText(input: EmbeddingTextInput): string {
  const parts = [
    `Contexto: ${input.context}`,
    `Objetivo: ${input.objective}`,
    `Entregáveis: ${input.deliverables}`,
    input.constraints ? `Restrições: ${input.constraints}` : "",
    input.milestones.length
      ? `Marcos: ${input.milestones.map((m) => `${m.title} - ${m.objective}`).join("; ")}`
      : "",
    input.activities.length
      ? `Atividades: ${input.activities.map((a) => `${a.title}: ${a.description}`).join("; ")}`
      : "",
  ];
  return parts.filter(Boolean).join("\n");
}
