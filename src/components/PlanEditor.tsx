"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  ActivityClassification,
  CreateVersionInput,
  PlanningDetail,
} from "@/lib/planner-api/client";

type EditableMilestone = {
  clientKey: string;
  external_id: string;
  title: string;
  objective: string;
  completion_criteria: string;
  removed: boolean;
};

type EditableActivity = {
  clientKey: string;
  external_id: string;
  milestone_external_id: string;
  title: string;
  description: string;
  expected_output: string;
  dependencies: string;
  status: "ready" | "blocked";
  removed: boolean;
  classification: ActivityClassification | "";
};

const CLASSIFICATION_LABELS: Record<ActivityClassification, string> = {
  fez_sentido: "Fez sentido",
  parcial: "Fez sentido parcialmente",
  nao_fez_sentido: "Não fez sentido",
};

function nextExternalId(existingIds: string[], prefix: string): string {
  let max = 0;
  for (const id of existingIds) {
    if (id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length))) {
      max = Math.max(max, Number(id.slice(prefix.length)));
    }
  }
  return `${prefix}${max + 1}`;
}

function toEditableMilestones(detail: PlanningDetail): EditableMilestone[] {
  return detail.milestones.map((milestone) => ({
    clientKey: milestone.external_id,
    external_id: milestone.external_id,
    title: milestone.title,
    objective: milestone.objective,
    completion_criteria: milestone.completion_criteria.join("\n"),
    removed: false,
  }));
}

function toEditableActivities(detail: PlanningDetail): EditableActivity[] {
  const feedbackByActivity = new Map(
    detail.activity_feedback.map((feedback) => [feedback.activity_external_id, feedback.classification])
  );
  return detail.activities.map((activity) => ({
    clientKey: activity.external_id,
    external_id: activity.external_id,
    milestone_external_id: activity.milestone_external_id,
    title: activity.title,
    description: activity.description,
    expected_output: activity.expected_output,
    dependencies: activity.dependencies.join(", "),
    status: activity.status,
    removed: false,
    classification: feedbackByActivity.get(activity.external_id) ?? "",
  }));
}

function swap<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function PlanEditor({ planningId, detail }: { planningId: string; detail: PlanningDetail }) {
  const router = useRouter();
  const [milestones, setMilestones] = useState<EditableMilestone[]>(() => toEditableMilestones(detail));
  const [activities, setActivities] = useState<EditableActivity[]>(() => toEditableActivities(detail));
  const [evaluate, setEvaluate] = useState(false);
  const [scores, setScores] = useState({
    utility_score: 3,
    coverage_score: 3,
    sequence_quality_score: 3,
    detail_level_score: 3,
    objective_adherence_score: 3,
  });
  const [evaluationNotes, setEvaluationNotes] = useState("");
  const [versionNotes, setVersionNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeMilestones = milestones.filter((m) => !m.removed);

  function updateMilestone(clientKey: string, patch: Partial<EditableMilestone>) {
    setMilestones((prev) => prev.map((m) => (m.clientKey === clientKey ? { ...m, ...patch } : m)));
  }

  function addMilestone() {
    const existingIds = milestones.map((m) => m.external_id);
    const external_id = nextExternalId(existingIds, "M");
    setMilestones((prev) => [
      ...prev,
      { clientKey: external_id, external_id, title: "", objective: "", completion_criteria: "", removed: false },
    ]);
  }

  function moveMilestone(clientKey: string, direction: -1 | 1) {
    setMilestones((prev) => {
      const index = prev.findIndex((m) => m.clientKey === clientKey);
      if (index < 0) return prev;
      return swap(prev, index, direction);
    });
  }

  function updateActivity(clientKey: string, patch: Partial<EditableActivity>) {
    setActivities((prev) => prev.map((a) => (a.clientKey === clientKey ? { ...a, ...patch } : a)));
  }

  function addActivity() {
    const existingIds = activities.map((a) => a.external_id);
    const external_id = nextExternalId(existingIds, "A");
    setActivities((prev) => [
      ...prev,
      {
        clientKey: external_id,
        external_id,
        milestone_external_id: activeMilestones[0]?.external_id ?? "",
        title: "",
        description: "",
        expected_output: "",
        dependencies: "",
        status: "ready",
        removed: false,
        classification: "",
      },
    ]);
  }

  function moveActivity(clientKey: string, direction: -1 | 1) {
    setActivities((prev) => {
      const index = prev.findIndex((a) => a.clientKey === clientKey);
      if (index < 0) return prev;
      return swap(prev, index, direction);
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const payload: CreateVersionInput = {
      milestones: milestones
        .filter((m) => !m.removed)
        .map((m) => ({
          external_id: m.external_id,
          title: m.title,
          objective: m.objective,
          completion_criteria: m.completion_criteria.split("\n").map((s) => s.trim()).filter(Boolean),
        })),
      activities: activities
        .filter((a) => !a.removed)
        .map((a) => ({
          external_id: a.external_id,
          milestone_external_id: a.milestone_external_id,
          title: a.title,
          description: a.description,
          expected_output: a.expected_output,
          dependencies: a.dependencies.split(",").map((s) => s.trim()).filter(Boolean),
          status: a.status,
        })),
      blockers: detail.blockers,
      activity_feedback: activities
        .filter((a) => a.classification)
        .map((a) => ({
          activity_external_id: a.external_id,
          classification: a.classification as ActivityClassification,
        })),
      notes: versionNotes || undefined,
    };

    if (evaluate) {
      payload.planning_feedback = { ...scores, notes: evaluationNotes || undefined };
    }

    try {
      const response = await fetch(`/api/plannings/${planningId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Falha ao salvar a nova versão.");
      }
      router.push(`/planejamentos/${planningId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha inesperada ao salvar.");
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Marcos</h2>
        {milestones.map((milestone, index) => (
          <div
            key={milestone.clientKey}
            className={`rounded-md border p-3 ${
              milestone.removed
                ? "border-gray-200 bg-gray-50 opacity-60 dark:border-gray-800 dark:bg-gray-900"
                : "border-gray-200 dark:border-gray-800"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500">{milestone.external_id}</span>
              <div className="flex gap-1">
                <IconButton onClick={() => moveMilestone(milestone.clientKey, -1)} disabled={index === 0}>
                  ↑
                </IconButton>
                <IconButton
                  onClick={() => moveMilestone(milestone.clientKey, 1)}
                  disabled={index === milestones.length - 1}
                >
                  ↓
                </IconButton>
                <button
                  type="button"
                  onClick={() => updateMilestone(milestone.clientKey, { removed: !milestone.removed })}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
                >
                  {milestone.removed ? "Restaurar" : "Remover"}
                </button>
              </div>
            </div>
            <input
              value={milestone.title}
              onChange={(e) => updateMilestone(milestone.clientKey, { title: e.target.value })}
              placeholder="Título do marco"
              className="mt-2 w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
            <input
              value={milestone.objective}
              onChange={(e) => updateMilestone(milestone.clientKey, { objective: e.target.value })}
              placeholder="Objetivo"
              className="mt-2 w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
            <textarea
              value={milestone.completion_criteria}
              onChange={(e) => updateMilestone(milestone.clientKey, { completion_criteria: e.target.value })}
              placeholder="Critérios de conclusão (um por linha)"
              rows={2}
              className="mt-2 w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addMilestone}
          className="self-start rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
        >
          Adicionar marco
        </button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Atividades</h2>
        {activities.map((activity, index) => (
          <div
            key={activity.clientKey}
            className={`rounded-md border p-3 ${
              activity.removed
                ? "border-gray-200 bg-gray-50 opacity-60 dark:border-gray-800 dark:bg-gray-900"
                : "border-gray-200 dark:border-gray-800"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500">{activity.external_id}</span>
              <div className="flex gap-1">
                <IconButton onClick={() => moveActivity(activity.clientKey, -1)} disabled={index === 0}>
                  ↑
                </IconButton>
                <IconButton
                  onClick={() => moveActivity(activity.clientKey, 1)}
                  disabled={index === activities.length - 1}
                >
                  ↓
                </IconButton>
                <button
                  type="button"
                  onClick={() => updateActivity(activity.clientKey, { removed: !activity.removed })}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
                >
                  {activity.removed ? "Restaurar" : "Remover"}
                </button>
              </div>
            </div>

            <input
              value={activity.title}
              onChange={(e) => updateActivity(activity.clientKey, { title: e.target.value })}
              placeholder="Título"
              className="mt-2 w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
            <textarea
              value={activity.description}
              onChange={(e) => updateActivity(activity.clientKey, { description: e.target.value })}
              placeholder="Descrição"
              rows={2}
              className="mt-2 w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
            <input
              value={activity.expected_output}
              onChange={(e) => updateActivity(activity.clientKey, { expected_output: e.target.value })}
              placeholder="Resultado esperado"
              className="mt-2 w-full rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />

            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                Marco
                <select
                  value={activity.milestone_external_id}
                  onChange={(e) => updateActivity(activity.clientKey, { milestone_external_id: e.target.value })}
                  className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  {activeMilestones.map((m) => (
                    <option key={m.external_id} value={m.external_id}>
                      {m.external_id} — {m.title || "(sem título)"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-gray-500">
                Dependências (separadas por vírgula)
                <input
                  value={activity.dependencies}
                  onChange={(e) => updateActivity(activity.clientKey, { dependencies: e.target.value })}
                  className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              </label>
            </div>

            <label className="mt-2 flex flex-col gap-1 text-xs text-gray-500">
              Classificação
              <select
                value={activity.classification}
                onChange={(e) =>
                  updateActivity(activity.clientKey, {
                    classification: e.target.value as ActivityClassification | "",
                  })
                }
                className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="">(sem classificação)</option>
                {Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
        <button
          type="button"
          onClick={addActivity}
          className="self-start rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
        >
          Adicionar atividade
        </button>
      </section>

      <section className="flex flex-col gap-3 border-t border-gray-200 pt-6 dark:border-gray-800">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={evaluate} onChange={(e) => setEvaluate(e.target.checked)} />
          Avaliar este planejamento
        </label>

        {evaluate && (
          <div className="flex flex-col gap-3">
            <ScoreField
              label="Utilidade geral"
              value={scores.utility_score}
              onChange={(value) => setScores((prev) => ({ ...prev, utility_score: value }))}
            />
            <ScoreField
              label="Cobertura"
              value={scores.coverage_score}
              onChange={(value) => setScores((prev) => ({ ...prev, coverage_score: value }))}
            />
            <ScoreField
              label="Qualidade da sequência"
              value={scores.sequence_quality_score}
              onChange={(value) => setScores((prev) => ({ ...prev, sequence_quality_score: value }))}
            />
            <ScoreField
              label="Nível de detalhamento"
              value={scores.detail_level_score}
              onChange={(value) => setScores((prev) => ({ ...prev, detail_level_score: value }))}
            />
            <ScoreField
              label="Aderência ao objetivo"
              value={scores.objective_adherence_score}
              onChange={(value) => setScores((prev) => ({ ...prev, objective_adherence_score: value }))}
            />
            <textarea
              value={evaluationNotes}
              onChange={(e) => setEvaluationNotes(e.target.value)}
              placeholder="Observações sobre o planejamento"
              rows={2}
              className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
        )}
      </section>

      <div className="flex flex-col gap-1">
        <label htmlFor="version-notes" className="text-sm font-medium">
          Observação sobre esta revisão
        </label>
        <textarea
          id="version-notes"
          value={versionNotes}
          onChange={(e) => setVersionNotes(e.target.value)}
          rows={2}
          className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
      </div>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSaving}
        className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {isSaving ? "Salvando..." : "Salvar nova versão"}
      </button>
    </form>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-30 dark:border-gray-700"
    >
      {children}
    </button>
  );
}

function ScoreField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border border-gray-300 p-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
