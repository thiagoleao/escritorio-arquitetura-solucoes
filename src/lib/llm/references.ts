import { semanticSearchPlannings, getPlanning } from "@/lib/planner-api/client";
import { createEmbedding } from "@/lib/embeddings/openai";
import { buildEmbeddingText } from "@/lib/embeddings/text";

export interface ReferenceCase {
  planning_id: string;
  company: string;
  project: string | null;
  similarity: number;
  objective: string;
  milestones: string[];
  activities: Array<{ title: string; expected_output: string }>;
}

// Calibrado empiricamente: a consulta usa só contexto/objetivo/entregáveis do
// novo pedido, comparada contra o embedding completo (que inclui marcos e
// atividades) do planejamento salvo — essa assimetria produz similaridades
// mais baixas que uma comparação planejamento-vs-planejamento. Em teste real,
// um caso genuinamente parecido pontuou ~0.71 e um caso não relacionado ~0.54.
const SIMILARITY_THRESHOLD = 0.65;
const MAX_REFERENCES = 3;
const CANDIDATE_POOL_SIZE = 10;
const SAME_PROJECT_BOOST = 0.25;
const SAME_COMPANY_BOOST = 0.1;

export async function findReferenceCases(input: {
  company: string;
  project?: string;
  context: string;
  objective: string;
  deliverables: string;
  constraints?: string;
}): Promise<ReferenceCase[]> {
  const embedding = await createEmbedding(
    buildEmbeddingText({
      context: input.context,
      objective: input.objective,
      deliverables: input.deliverables,
      constraints: input.constraints,
      milestones: [],
      activities: [],
    })
  );
  if (!embedding) {
    return [];
  }

  let candidates;
  try {
    candidates = await semanticSearchPlannings({
      embedding,
      status: "approved",
      limit: CANDIDATE_POOL_SIZE,
    });
  } catch (error) {
    console.error("Falha ao buscar planejamentos de referência", error);
    return [];
  }

  const ranked = candidates
    .map((candidate) => {
      const similarity = candidate.similarity ?? 0;
      let boost = 0;
      if (input.project && candidate.project_name?.toLowerCase() === input.project.toLowerCase()) {
        boost = SAME_PROJECT_BOOST;
      } else if (candidate.company_name.toLowerCase() === input.company.toLowerCase()) {
        boost = SAME_COMPANY_BOOST;
      }
      return { candidate, similarity, score: similarity + boost };
    })
    .filter((entry) => entry.similarity >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_REFERENCES);

  const references: ReferenceCase[] = [];
  for (const entry of ranked) {
    try {
      const detail = await getPlanning(entry.candidate.id);
      references.push({
        planning_id: entry.candidate.id,
        company: detail.planning.company_name,
        project: detail.planning.project_name,
        similarity: entry.similarity,
        objective: detail.planning.objective,
        milestones: detail.milestones.map((m) => m.title),
        activities: detail.activities.map((a) => ({ title: a.title, expected_output: a.expected_output })),
      });
    } catch (error) {
      console.error(`Falha ao buscar detalhe do planejamento de referência ${entry.candidate.id}`, error);
    }
  }
  return references;
}
