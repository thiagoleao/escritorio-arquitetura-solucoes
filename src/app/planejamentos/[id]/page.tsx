import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlanning, listPlanningVersions, type PlanningFeedback } from "@/lib/planner-api/client";
import { planningDetailToArchitecturePlan } from "@/lib/planner-api/mapper";
import { PlanResult } from "@/components/PlanResult";
import { StatusActions } from "@/components/StatusActions";

export const dynamic = "force-dynamic";

const SCORE_LABELS: Record<Exclude<keyof PlanningFeedback, "notes">, string> = {
  utility_score: "Utilidade geral",
  coverage_score: "Cobertura",
  sequence_quality_score: "Qualidade da sequência",
  detail_level_score: "Nível de detalhamento",
  objective_adherence_score: "Aderência ao objetivo",
};

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

  const versions = await listPlanningVersions(id).catch(() => []);
  const plan = planningDetailToArchitecturePlan(detail);
  const activityClassifications = Object.fromEntries(
    detail.activity_feedback.map((feedback) => [feedback.activity_external_id, feedback.classification])
  );

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
          <div className="mt-2">
            <StatusActions planningId={id} status={detail.planning.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/planejamentos/${id}/editar`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
          >
            Editar
          </Link>
          <Link
            href="/planejamentos"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
          >
            Voltar
          </Link>
        </div>
      </header>

      {versions.length > 1 && (
        <Section title="Histórico de versões">
          <ul className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
            {versions.map((version) => (
              <li key={version.version_number}>
                v{version.version_number} — {version.created_by === "model" ? "gerada pelo modelo" : "editada"} em{" "}
                {new Date(version.created_at).toLocaleString("pt-BR")}
                {version.notes ? ` — ${version.notes}` : ""}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {detail.planning_feedback && (
        <Section title="Avaliação">
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {(Object.entries(SCORE_LABELS) as Array<[keyof typeof SCORE_LABELS, string]>).map(([key, label]) => (
              <div key={key}>
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="font-medium">{detail.planning_feedback?.[key]} / 5</dd>
              </div>
            ))}
          </dl>
          {detail.planning_feedback.notes && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{detail.planning_feedback.notes}</p>
          )}
        </Section>
      )}

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
        <PlanResult plan={plan} activityClassifications={activityClassifications} />
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
