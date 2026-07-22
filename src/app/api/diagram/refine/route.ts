import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { refineDiagram, type DiagramRefineInput } from "@/lib/llm/diagram-refiner";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as DiagramRefineInput | null;
  if (!body || typeof body.discovery !== "string") {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  try {
    const result = await refineDiagram({
      discovery: body.discovery,
      grafoAtual: body.grafoAtual ?? null,
      historico: Array.isArray(body.historico) ? body.historico : [],
      mensagem: body.mensagem,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Falha ao refinar o diagrama", error);
    const message = error instanceof Error ? error.message : "Falha ao refinar o diagrama. Tente novamente.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
