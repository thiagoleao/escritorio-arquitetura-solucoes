import Link from "next/link";
import { getBoard } from "@/lib/planner-api/client";
import { BoardColumns } from "@/components/BoardColumns";

export const dynamic = "force-dynamic";

export default async function QuadroPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const { company } = await searchParams;

  let board: Awaited<ReturnType<typeof getBoard>> = [];
  let error: string | null = null;
  try {
    board = await getBoard({ company });
  } catch (err) {
    error = err instanceof Error ? err.message : "Falha ao carregar o board.";
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Quadro</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Acompanhamento de execução dos projetos aprovados, agrupados por empresa.
          </p>
        </div>
        <Link href="/planejamentos" className="glass-pill glass-pill-secondary glass-pill-sm">
          Ver histórico
        </Link>
      </header>

      <form className="flex gap-2">
        <input
          type="text"
          name="company"
          defaultValue={company}
          placeholder="Filtrar por empresa"
          className="glass-input w-full max-w-sm"
        />
        <button type="submit" className="glass-pill glass-pill-secondary">
          Filtrar
        </button>
        {company && (
          <Link href="/quadro" className="glass-pill glass-pill-secondary">
            Ver todas
          </Link>
        )}
      </form>

      {error && <p className="glass-alert-error">{error}</p>}

      {!error && board.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum projeto aprovado no momento.</p>
      )}

      {board.length > 0 && (
        <section className="glass-card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Progresso por projeto
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {board.map((entry) => (
              <li key={entry.planning_id} className="flex items-center justify-between gap-4">
                <span>
                  {entry.company_name}
                  {entry.project_name ? ` — ${entry.project_name}` : ""}
                </span>
                <span className="text-gray-500 dark:text-gray-400">{entry.completion_percentage}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BoardColumns board={board} />
    </main>
  );
}
