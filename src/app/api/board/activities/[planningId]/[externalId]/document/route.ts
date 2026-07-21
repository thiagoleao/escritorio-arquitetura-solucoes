import { auth } from "@/auth";
import { getActivityDocument, PlannerApiError } from "@/lib/planner-api/client";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ planningId: string; externalId: string }> }
) {
  const { planningId, externalId } = await params;

  try {
    const session = await auth();
    const { blob, filename } = await getActivityDocument(planningId, externalId, session?.user?.id);
    return new Response(blob, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Falha ao gerar o documento da atividade", error);
    const status = error instanceof PlannerApiError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Falha ao gerar o documento. Tente novamente.";
    return Response.json({ error: message }, { status });
  }
}
