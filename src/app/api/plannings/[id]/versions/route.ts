import { NextResponse } from "next/server";
import { createPlanningVersion, getPlanning, type CreateVersionInput } from "@/lib/planner-api/client";
import { createEmbedding } from "@/lib/embeddings/openai";
import { buildEmbeddingText } from "@/lib/embeddings/text";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as CreateVersionInput | null;
  if (!body) {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  let embedding: number[] | null = null;
  try {
    const current = await getPlanning(id);
    embedding = await createEmbedding(
      buildEmbeddingText({
        context: current.planning.context,
        objective: current.planning.objective,
        deliverables: current.planning.deliverables,
        constraints: current.planning.constraints,
        milestones: body.milestones,
        activities: body.activities,
      })
    );
  } catch (error) {
    console.error("Falha ao calcular embedding da nova versão", error);
  }

  try {
    const result = await createPlanningVersion(id, { ...body, embedding });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Falha ao criar nova versão do planejamento", error);
    return NextResponse.json({ error: "Falha ao salvar a nova versão. Tente novamente." }, { status: 502 });
  }
}
