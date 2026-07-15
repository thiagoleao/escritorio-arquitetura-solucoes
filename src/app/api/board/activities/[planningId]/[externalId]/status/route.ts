import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateActivityExecutionStatus, type ExecutionStatus } from "@/lib/planner-api/client";

export const runtime = "nodejs";

const VALID_STATUSES: ExecutionStatus[] = ["todo", "doing", "done"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ planningId: string; externalId: string }> }
) {
  const { planningId, externalId } = await params;
  const body = (await request.json().catch(() => null)) as { status?: string } | null;

  if (!body?.status || !VALID_STATUSES.includes(body.status as ExecutionStatus)) {
    return NextResponse.json({ error: "Campo status inválido." }, { status: 400 });
  }

  try {
    const session = await auth();
    const result = await updateActivityExecutionStatus(
      planningId,
      externalId,
      body.status as ExecutionStatus,
      session?.user?.email ?? undefined
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao atualizar status de execução da atividade", error);
    return NextResponse.json({ error: "Falha ao atualizar o status. Tente novamente." }, { status: 502 });
  }
}
