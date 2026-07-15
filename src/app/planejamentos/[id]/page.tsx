import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlanning } from "@/lib/planner-api/client";
import { planningDetailToArchitecturePlan } from "@/lib/planner-api/mapper";
import { PlanResult } from "@/components/PlanResult";

export const dynamic = "force-dynamic";

export default async function PlanejamentoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail;
  try {
    detail = await getPlanning(id);
  } catch {
    notFound();
  }

  const plan = planningDetailToArchitecturePlan(detail);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {detail.planning.company_name}
            {detail.planning.project_name ? ` — ${detail.planning.project_name}` : ""}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Versão {detail.version.version_number} · {new Date(detail.planning.created_at).toLocaleString("pt-BR")}
          </p>
        </div>
        <Link
          href="/planejamentos"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
        >
          Voltar
        </Link>
      </header>

      <Section title="Contexto original">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">Objetivo</dt>
            <dd className="text-gray-600 dark:text-gray-400">{detail.planning.objective}</dd>
          </div>
          <div>
            <dt className="font-medium">Entregáveis</dt>
            <dd className="text-gray-600 dark:text-gray-400">{detail.planning.deliverables}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium">Contexto</dt>
            <dd className="text-gray-600 dark:text-gray-400">{detail.planning.context}</dd>
          </div>
          {detail.planning.constraints && (
            <div className="sm:col-span-2">
              <dt className="font-medium">Restrições</dt>
              <dd className="text-gray-600 dark:text-gray-400">{detail.planning.constraints}</dd>
            </div>
          )}
        </dl>
      </Section>

      <div className="border-t border-gray-200 pt-6 dark:border-gray-800">
        <PlanResult plan={plan} />
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </div>
  );
}
