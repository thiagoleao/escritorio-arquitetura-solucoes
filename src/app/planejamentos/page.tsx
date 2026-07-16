import Link from "next/link";
import { auth } from "@/auth";
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
  const session = await auth();
  let plannings: PlanningSummary[] = [];
  let error: string | null = null;

  try {
    if (q?.trim()) {
      const embedding = await createEmbedding(q.trim());
      plannings = embedding
        ? await semanticSearchPlannings({ embedding, limit: 20, scopeUserId: session?.user?.id })
        : [];
      if (!embedding) {
        error = "Não foi possível calcular a busca semântica (verifique a configuração do OpenAI).";
      }
    } else {
      plannings = await listPlannings({ limit: 100 }, session?.user?.id);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Falha ao carregar planejamentos.";
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Planejamentos</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Histórico de planejamentos gerados.</p>
      </header>

      <form className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Pesquisar em linguagem natural (ex: soluções de IA com processamento documental)"
          className="glass-input w-full"
        />
        <button type="submit" className="glass-pill glass-pill-secondary">
          Pesquisar
        </button>
        {q && (
          <Link href="/planejamentos" className="glass-pill glass-pill-secondary">
            Limpar
          </Link>
        )}
      </form>

      {error && <p className="glass-alert-error">{error}</p>}

      {!error && plannings.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {q ? "Nenhum planejamento semelhante encontrado." : "Nenhum planejamento salvo ainda."}
        </p>
      )}

      {plannings.length > 0 && (
        <ul className="flex flex-col gap-3">
          {plannings.map((planning) => (
            <li key={planning.id}>
              <Link
                href={`/planejamentos/${planning.id}`}
                className="glass-card glass-card-hover flex items-center justify-between gap-4 p-4 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {planning.company_name}
                    {planning.project_name ? ` — ${planning.project_name}` : ""}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(planning.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {planning.similarity !== undefined && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {Math.round(planning.similarity * 100)}% semelhante
                    </span>
                  )}
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs backdrop-blur-md ${
                      planning.status === "approved"
                        ? "border-green-300/60 bg-green-100/70 text-green-700 dark:border-green-800/50 dark:bg-green-950/50 dark:text-green-300"
                        : "border-white/60 bg-white/40 dark:border-white/10 dark:bg-white/10"
                    }`}
                  >
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
