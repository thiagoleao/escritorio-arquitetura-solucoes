import type { ArchitecturePlan } from "@/lib/schema";

export function formatPlanAsText(plan: ArchitecturePlan): string {
  const lines: string[] = [];
  lines.push(`Resumo\n${plan.summary}`);

  if (plan.assumptions.length) {
    lines.push(`Premissas\n${plan.assumptions.map((item) => `- ${item}`).join("\n")}`);
  }
  if (plan.missing_information.length) {
    lines.push(
      `Informações ausentes\n${plan.missing_information.map((item) => `- ${item}`).join("\n")}`
    );
  }

  lines.push(
    `Marcos\n${plan.milestones
      .map((m) => `${m.id} - ${m.title}\n  Objetivo: ${m.objective}\n  Critérios: ${m.completion_criteria.join("; ")}`)
      .join("\n")}`
  );

  lines.push(
    `Atividades\n${plan.activities
      .map(
        (a) =>
          `${a.id} - ${a.title} [${a.status}] (marco ${a.milestone_id})\n  ${a.description}\n  Dependências: ${
            a.dependencies.length ? a.dependencies.join(", ") : "nenhuma"
          }\n  Resultado esperado: ${a.expected_output}`
      )
      .join("\n")}`
  );

  if (plan.blockers.length) {
    lines.push(
      `Bloqueios\n${plan.blockers
        .map((b) => `- ${b.description} (atividades: ${b.related_activity_ids.join(", ") || "nenhuma"})`)
        .join("\n")}`
    );
  }

  return lines.join("\n\n");
}
