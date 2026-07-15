import Link from "next/link";
import { listPlannings, semanticSearchPlannings, type PlanningSummary } from "@/lib/planner-api/client";
import { createEmbedding } from "@/lib/embeddings/openai";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  generated: "Gerado",
  in_review: "Em revisão",
  reviewed: "Revisado",
  approved: "Aprovado",
  archived: "Arquivado",
};

export default async function PlanejamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  let plannings: PlanningSummary[] = [];
  let error: string | null = null;

  try {
    if (q?.trim()) {
      const embedding = await createEmbedding(q.trim());
      plannings = embedding
        ? await semanticSearchPlannings({ embedding, limit: 20 })
        : [];
      if (!embedding) {
        error = "Não foi possível calcular a busca semântica (verifique a configuração do OpenAI).";
      }
    } else {
      plannings = await listPlannings({ limit: 100 });
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Falha ao carregar planejamentos.";
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Planejamentos</h1>
          <p className="mt-1 text-sm text-gray-500">Histórico de planejamentos gerados.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/quadro"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
          >
            Quadro
          </Link>
          <Link
            href="/"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
          >
            Novo planejamento
          </Link>
        </div>
      </header>

      <form className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Pesquisar em linguagem natural (ex: soluções de IA com processamento documental)"
          className="w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
        >
          Pesquisar
        </button>
        {q && (
          <Link
            href="/planejamentos"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
          >
            Limpar
          </Link>
        )}
      </form>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {!error && plannings.length === 0 && (
        <p className="text-sm text-gray-500">
          {q ? "Nenhum planejamento semelhante encontrado." : "Nenhum planejamento salvo ainda."}
        </p>
      )}

      {plannings.length > 0 && (
        <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
          {plannings.map((planning) => (
            <li key={planning.id} className="py-3">
              <Link
                href={`/planejamentos/${planning.id}`}
                className="flex items-center justify-between gap-4 text-sm hover:underline"
              >
                <div>
                  <p className="font-medium">
                    {planning.company_name}
                    {planning.project_name ? ` — ${planning.project_name}` : ""}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(planning.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {planning.similarity !== undefined && (
                    <span className="text-xs text-gray-500">
                      {Math.round(planning.similarity * 100)}% semelhante
                    </span>
                  )}
                  <span className="rounded-full border border-gray-300 px-2 py-0.5 text-xs dark:border-gray-700">
                    {STATUS_LABELS[planning.status] ?? planning.status}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
