import type { ArchitecturePlan } from "@/lib/schema";

const CLASSIFICATION_LABELS: Record<string, string> = {
  fez_sentido: "Fez sentido",
  parcial: "Fez sentido parcialmente",
  nao_fez_sentido: "Não fez sentido",
};

export function PlanResult({
  plan,
  activityClassifications,
}: {
  plan: ArchitecturePlan;
  activityClassifications?: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Resumo">
        <p className="text-sm">{plan.summary}</p>
      </Section>

      {plan.assumptions.length > 0 && (
        <Section title="Premissas">
          <BulletList items={plan.assumptions} />
        </Section>
      )}

      {plan.missing_information.length > 0 && (
        <Section title="Informações ausentes">
          <BulletList items={plan.missing_information} />
        </Section>
      )}

      <Section title="Marcos">
        <ul className="flex flex-col gap-3">
          {plan.milestones.map((milestone) => (
            <li key={milestone.id} className="rounded-2xl border border-white/50 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
              <p className="text-sm font-medium">
                {milestone.id} — {milestone.title}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{milestone.objective}</p>
              <BulletList items={milestone.completion_criteria} className="mt-2" />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Atividades">
        <ul className="flex flex-col gap-3">
          {plan.activities.map((activity) => (
            <li key={activity.id} className="rounded-2xl border border-white/50 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {activity.id} — {activity.title}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    activity.status === "blocked"
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                  }`}
                >
                  {activity.status === "blocked" ? "bloqueada" : "pronta"}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{activity.description}</p>
              {activityClassifications?.[activity.id] && (
                <p className="mt-1 text-xs font-medium text-blue-700 dark:text-blue-300">
                  Classificação: {CLASSIFICATION_LABELS[activityClassifications[activity.id]] ?? activityClassifications[activity.id]}
                </p>
              )}
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Marco: {activity.milestone_id}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Dependências: {activity.dependencies.length ? activity.dependencies.join(", ") : "nenhuma"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Resultado esperado: {activity.expected_output}</p>
            </li>
          ))}
        </ul>
      </Section>

      {plan.blockers.length > 0 && (
        <Section title="Bloqueios">
          <ul className="flex flex-col gap-2">
            {plan.blockers.map((blocker, index) => (
              <li key={index} className="text-sm">
                <p>{blocker.description}</p>
                {blocker.related_activity_ids.length > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Atividades relacionadas: {blocker.related_activity_ids.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h3>
      {children}
    </div>
  );
}

function BulletList({ items, className = "" }: { items: string[]; className?: string }) {
  return (
    <ul className={`list-inside list-disc text-sm text-gray-700 dark:text-gray-300 ${className}`}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
