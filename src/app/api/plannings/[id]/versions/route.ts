import { NextResponse } from "next/server";
import { createPlanningVersion, type CreateVersionInput } from "@/lib/planner-api/client";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as CreateVersionInput | null;
  if (!body) {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  try {
    const result = await createPlanningVersion(id, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Falha ao criar nova versão do planejamento", error);
    return NextResponse.json({ error: "Falha ao salvar a nova versão. Tente novamente." }, { status: 502 });
  }
}
