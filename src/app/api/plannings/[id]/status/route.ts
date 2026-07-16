import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { updatePlanningStatus } from "@/lib/planner-api/client";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  if (!body?.status) {
    return NextResponse.json({ error: "Campo status é obrigatório." }, { status: 400 });
  }

  try {
    const result = await updatePlanningStatus(id, body.status, session?.user?.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao atualizar status do planejamento", error);
    return NextResponse.json({ error: "Falha ao atualizar o status. Tente novamente." }, { status: 502 });
  }
}
