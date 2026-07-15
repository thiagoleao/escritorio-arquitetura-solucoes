import Link from "next/link";
import { listPlannings } from "@/lib/planner-api/client";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  generated: "Gerado",
  in_review: "Em revisão",
  reviewed: "Revisado",
  approved: "Aprovado",
  archived: "Arquivado",
};

export default async function PlanejamentosPage() {
  let plannings: Awaited<ReturnType<typeof listPlannings>> = [];
  let error: string | null = null;

  try {
    plannings = await listPlannings({ limit: 100 });
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
        <Link
          href="/"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
        >
          Novo planejamento
        </Link>
      </header>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {!error && plannings.length === 0 && (
        <p className="text-sm text-gray-500">Nenhum planejamento salvo ainda.</p>
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
                <span className="rounded-full border border-gray-300 px-2 py-0.5 text-xs dark:border-gray-700">
                  {STATUS_LABELS[planning.status] ?? planning.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
