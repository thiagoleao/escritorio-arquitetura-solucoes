import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createUser, listUsers, PlannerApiError, type CreateUserInput } from "@/lib/planner-api/client";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }

  try {
    const users = await listUsers();
    return NextResponse.json(users);
  } catch (error) {
    console.error("Falha ao listar usuários", error);
    return NextResponse.json({ error: "Falha ao listar usuários." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as CreateUserInput | null;
  if (!body?.name || !body?.email || !body?.password || !body?.role) {
    return NextResponse.json({ error: "Campos obrigatórios: name, email, password, role." }, { status: 400 });
  }

  try {
    const user = await createUser(body);
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof PlannerApiError && error.status === 409) {
      return NextResponse.json({ error: "Este e-mail já está em uso." }, { status: 409 });
    }
    console.error("Falha ao criar usuário", error);
    return NextResponse.json({ error: "Falha ao criar usuário." }, { status: 502 });
  }
}
