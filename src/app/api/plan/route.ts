import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { getLLMProvider } from "@/lib/llm";
import {
  extractFiles,
  formatExtractedFilesText,
  UnsupportedFileError,
  FileTooLargeError,
} from "@/lib/files/extract";
import { createPlanning } from "@/lib/planner-api/client";
import { createEmbedding } from "@/lib/embeddings/openai";
import { buildEmbeddingText } from "@/lib/embeddings/text";
import { findReferenceCases } from "@/lib/llm/references";

export const runtime = "nodejs";

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function POST(request: Request) {
  const session = await auth();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o formulário enviado." }, { status: 400 });
  }

  const company = getStringField(formData, "company");
  const project = getStringField(formData, "project");
  const context = getStringField(formData, "context");
  const objective = getStringField(formData, "objective");
  const deliverables = getStringField(formData, "deliverables");
  const constraints = getStringField(formData, "constraints");

  if (!company.trim() || !context.trim() || !objective.trim() || !deliverables.trim()) {
    return NextResponse.json(
      { error: "Empresa, contexto, objetivo e entregáveis são campos obrigatórios." },
      { status: 400 }
    );
  }

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0 && entry.name !== "");

  let extractedFilesText = "";
  try {
    const extracted = await extractFiles(files);
    extractedFilesText = formatExtractedFilesText(extracted);
  } catch (error) {
    if (error instanceof UnsupportedFileError || error instanceof FileTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Falha ao extrair conteúdo dos arquivos", error);
    return NextResponse.json({ error: "Falha ao extrair o conteúdo de um dos arquivos enviados." }, { status: 422 });
  }

  const referenceCases = await findReferenceCases({
    company,
    project: project || undefined,
    context,
    objective,
    deliverables,
    constraints,
  }).catch((error) => {
    console.error("Falha ao buscar casos de referência", error);
    return [];
  });

  try {
    const provider = getLLMProvider();
    const plan = await provider.generateArchitecturePlan({
      context,
      objective,
      deliverables,
      constraints,
      extractedFilesText,
      referenceCases,
    });

    let planningId: string | undefined;
    let saveWarning: string | undefined;
    try {
      const embedding = await createEmbedding(
        buildEmbeddingText({
          context,
          objective,
          deliverables,
          constraints,
          milestones: plan.milestones,
          activities: plan.activities,
        })
      );
      const saved = await createPlanning(
        {
          company,
          project: project || undefined,
          context,
          objective,
          deliverables,
          constraints: constraints || undefined,
          plan,
          embedding,
        },
        session?.user?.id
      );
      planningId = saved.planning_id;
    } catch (saveError) {
      console.error("Falha ao salvar planejamento no histórico", saveError);
      saveWarning = "O planejamento foi gerado, mas não foi possível salvá-lo no histórico.";
    }

    // Reference cases may belong to other users. The similarity search itself
    // (the shared "intelligence") stays cross-user to improve generation
    // quality, but identifying details are only shown to admins — members
    // only see that similar cases informed the plan, not whose they are.
    const isAdmin = session?.user?.role === "admin";
    const referencesUsed = referenceCases.map((referenceCase) => ({
      planning_id: isAdmin ? referenceCase.planning_id : undefined,
      company: isAdmin ? referenceCase.company : undefined,
      project: isAdmin ? referenceCase.project : undefined,
      similarity: referenceCase.similarity,
    }));

    return NextResponse.json({
      ...plan,
      planning_id: planningId,
      save_warning: saveWarning,
      references_used: referencesUsed,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      console.error("Resposta do modelo fora do contrato esperado", error);
      return NextResponse.json(
        { error: "O modelo retornou uma resposta em formato inesperado. Tente novamente." },
        { status: 502 }
      );
    }
    console.error("Falha ao gerar o planejamento", error);
    const message = error instanceof Error ? error.message : "Falha ao gerar o planejamento. Tente novamente.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
