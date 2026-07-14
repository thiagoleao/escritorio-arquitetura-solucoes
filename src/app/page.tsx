"use client";

import { useMemo, useState } from "react";
import type { ArchitecturePlan } from "@/lib/schema";

const ACCEPTED_EXTENSIONS = ".pdf,.txt,.md,.docx";

function formatPlanAsText(plan: ArchitecturePlan): string {
  const lines: string[] = [];
  lines.push(`Resumo\n${plan.summary}`);

  if (plan.assumptions.length) {
    lines.push(`Premissas\n${plan.assumptions.map((item) => `- ${item}`).join("\n")}`);
  }
  if (plan.missing_information.length) {
    lines.push(
      `Informações ausentes\n${plan.missing_information.map((item) => `- ${item}`).join("\n")}`
    );
  }

  lines.push(
    `Marcos\n${plan.milestones
      .map((m) => `${m.id} - ${m.title}\n  Objetivo: ${m.objective}\n  Critérios: ${m.completion_criteria.join("; ")}`)
      .join("\n")}`
  );

  lines.push(
    `Atividades\n${plan.activities
      .map(
        (a) =>
          `${a.id} - ${a.title} [${a.status}] (marco ${a.milestone_id})\n  ${a.description}\n  Dependências: ${
            a.dependencies.length ? a.dependencies.join(", ") : "nenhuma"
          }\n  Resultado esperado: ${a.expected_output}`
      )
      .join("\n")}`
  );

  if (plan.blockers.length) {
    lines.push(
      `Bloqueios\n${plan.blockers
        .map((b) => `- ${b.description} (atividades: ${b.related_activity_ids.join(", ") || "nenhuma"})`)
        .join("\n")}`
    );
  }

  return lines.join("\n\n");
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ArchitecturePlan | null>(null);
  const [copied, setCopied] = useState(false);

  const planAsText = useMemo(() => (plan ? formatPlanAsText(plan) : ""), [plan]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setPlan(null);
    setCopied(false);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/plan", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Falha ao gerar o planejamento.");
      }
      setPlan(data as ArchitecturePlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha inesperada ao gerar o planejamento.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(planAsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Planejador de Soluções de Arquitetura</h1>
        <p className="mt-1 text-sm text-gray-500">
          Descreva a demanda e gere um roadmap com marcos, atividades, dependências e bloqueios. Nada é
          salvo — copie o resultado ao final.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Field label="Contexto da demanda" name="context" required />
        <Field label="Objetivo da solução" name="objective" required />
        <Field label="Entregáveis esperados" name="deliverables" required />
        <Field label="Restrições e observações" name="constraints" />

        <div className="flex flex-col gap-1">
          <label htmlFor="files" className="text-sm font-medium">
            Arquivos de apoio (PDF, TXT, Markdown, DOCX)
          </label>
          <input
            id="files"
            name="files"
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS}
            className="rounded-md border border-gray-300 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 dark:border-gray-700 dark:file:bg-gray-800"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {isLoading ? "Gerando planejamento..." : "Gerar planejamento"}
        </button>
      </form>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {plan && (
        <section className="flex flex-col gap-6 border-t border-gray-200 pt-6 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Resultado</h2>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
            >
              {copied ? "Copiado!" : "Copiar conteúdo"}
            </button>
          </div>

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
                <li key={milestone.id} className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
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
                <li key={activity.id} className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
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
                  <p className="mt-2 text-xs text-gray-500">Marco: {activity.milestone_id}</p>
                  <p className="text-xs text-gray-500">
                    Dependências: {activity.dependencies.length ? activity.dependencies.join(", ") : "nenhuma"}
                  </p>
                  <p className="text-xs text-gray-500">Resultado esperado: {activity.expected_output}</p>
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
                      <p className="text-xs text-gray-500">
                        Atividades relacionadas: {blocker.related_activity_ids.join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </section>
      )}
    </main>
  );
}

function Field({
  label,
  name,
  required,
}: {
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <textarea
        id={name}
        name={name}
        required={required}
        rows={3}
        className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
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
