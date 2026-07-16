import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateActivityDetails, type UpdateActivityDetailsInput } from "@/lib/planner-api/client";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ planningId: string; externalId: string }> }
) {
  const { planningId, externalId } = await params;
  const body = (await request.json().catch(() => null)) as UpdateActivityDetailsInput | null;

  if (!body) {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  try {
    const session = await auth();
    const result = await updateActivityDetails(planningId, externalId, body, session?.user?.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao atualizar os detalhes da atividade", error);
    return NextResponse.json({ error: "Falha ao salvar as alterações. Tente novamente." }, { status: 502 });
  }
}
