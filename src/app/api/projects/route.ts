import { NextRequest, NextResponse } from "next/server";
import { listProjects } from "@/lib/planner-api/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("company_id");
  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (!companyId) {
    return NextResponse.json([], { status: 200 });
  }
  try {
    const projects = await listProjects(companyId, query);
    return NextResponse.json(projects);
  } catch (error) {
    console.error("Falha ao listar projetos", error);
    return NextResponse.json([], { status: 200 });
  }
}
