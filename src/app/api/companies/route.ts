import { NextRequest, NextResponse } from "next/server";
import { listCompanies } from "@/lib/planner-api/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const companies = await listCompanies(query);
    return NextResponse.json(companies);
  } catch (error) {
    console.error("Falha ao listar empresas", error);
    return NextResponse.json([], { status: 200 });
  }
}
