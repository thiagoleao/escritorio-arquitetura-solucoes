import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { PlannerApiError, updateUser, type UpdateUserInput } from "@/lib/planner-api/client";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as UpdateUserInput | null;
  if (!body) {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  try {
    const user = await updateUser(id, body);
    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof PlannerApiError && error.status === 409) {
      return NextResponse.json({ error: "Este e-mail já está em uso." }, { status: 409 });
    }
    if (error instanceof PlannerApiError && error.status === 404) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }
    console.error("Falha ao atualizar usuário", error);
    return NextResponse.json({ error: "Falha ao atualizar usuário." }, { status: 502 });
  }
}
