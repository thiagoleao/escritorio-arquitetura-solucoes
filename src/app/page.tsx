"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ArchitecturePlan } from "@/lib/schema";
import { formatPlanAsText } from "@/lib/format-plan";
import { PlanResult } from "@/components/PlanResult";
import { clearDraft, readDraft, useDraftPersistence } from "@/lib/form-draft";

const ACCEPTED_EXTENSIONS = ".pdf,.txt,.md,.docx";
const DRAFT_KEY = "planner:draft:new";

interface NewPlanDraft {
  company: string;
  project: string;
  context: string;
  objective: string;
  deliverables: string;
  constraints: string;
}

interface NamedOption {
  id: string;
  name: string;
}

interface ReferenceUsed {
  planning_id: string;
  company: string;
  project: string | null;
  similarity: number;
}

interface GenerateResponse extends ArchitecturePlan {
  planning_id?: string;
  save_warning?: string;
  references_used?: ReferenceUsed[];
}

function useAutocomplete(fetchUrl: (query: string) => string | null, initialQuery = "") {
  const [query, setQuery] = useState(initialQuery);
  const [options, setOptions] = useState<NamedOption[]>([]);

  useEffect(() => {
    const url = fetchUrl(query);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      if (url === null) {
        setOptions([]);
        return;
      }
      fetch(url, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setOptions(Array.isArray(data) ? data : []))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, fetchUrl]);

  return { query, setQuery, options };
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<GenerateResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [draft] = useState(() => readDraft<NewPlanDraft>(DRAFT_KEY));
  const [formText, setFormText] = useState({
    context: draft?.context ?? "",
    objective: draft?.objective ?? "",
    deliverables: draft?.deliverables ?? "",
    constraints: draft?.constraints ?? "",
  });

  const company = useAutocomplete(
    (query) => (query.trim() ? `/api/companies?q=${encodeURIComponent(query)}` : null),
    draft?.company ?? ""
  );
  const matchedCompany = company.options.find((option) => option.name === company.query) ?? null;

  const project = useAutocomplete(
    (query) => (matchedCompany ? `/api/projects?company_id=${matchedCompany.id}&q=${encodeURIComponent(query)}` : null),
    draft?.project ?? ""
  );

  useDraftPersistence<NewPlanDraft>(DRAFT_KEY, {
    company: company.query,
    project: project.query,
    ...formText,
  });

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
      setPlan(data as GenerateResponse);
      clearDraft(DRAFT_KEY);
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
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Planejador de Soluções de Arquitetura</h1>
          <p className="mt-1 text-sm text-gray-500">
            Descreva a demanda e gere um roadmap com marcos, atividades, dependências e bloqueios.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/quadro"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
          >
            Quadro
          </Link>
          <Link
            href="/planejamentos"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
          >
            Ver histórico
          </Link>
        </div>
      </header>

      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="company" className="text-sm font-medium">
              Empresa <span className="text-red-500">*</span>
            </label>
            <input
              id="company"
              name="company"
              required
              list="company-options"
              value={company.query}
              onChange={(event) => company.setQuery(event.target.value)}
              className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
            <datalist id="company-options">
              {company.options.map((option) => (
                <option key={option.id} value={option.name} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="project" className="text-sm font-medium">
              Projeto
            </label>
            <input
              id="project"
              name="project"
              list="project-options"
              value={project.query}
              onChange={(event) => project.setQuery(event.target.value)}
              disabled={!matchedCompany && company.query.trim() === ""}
              className="rounded-md border border-gray-300 p-2 text-sm disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900"
            />
            <datalist id="project-options">
              {project.options.map((option) => (
                <option key={option.id} value={option.name} />
              ))}
            </datalist>
          </div>
        </div>

        <Field
          label="Contexto da demanda"
          name="context"
          required
          value={formText.context}
          onChange={(value) => setFormText((prev) => ({ ...prev, context: value }))}
        />
        <Field
          label="Objetivo da solução"
          name="objective"
          required
          value={formText.objective}
          onChange={(value) => setFormText((prev) => ({ ...prev, objective: value }))}
        />
        <Field
          label="Entregáveis esperados"
          name="deliverables"
          required
          value={formText.deliverables}
          onChange={(value) => setFormText((prev) => ({ ...prev, deliverables: value }))}
        />
        <Field
          label="Restrições e observações"
          name="constraints"
          value={formText.constraints}
          onChange={(value) => setFormText((prev) => ({ ...prev, constraints: value }))}
        />

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

          {plan.save_warning && (
            <p className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
              {plan.save_warning}
            </p>
          )}
          {plan.planning_id && (
            <p className="text-sm text-gray-500">
              Salvo no histórico —{" "}
              <Link href={`/planejamentos/${plan.planning_id}`} className="underline">
                ver planejamento
              </Link>
            </p>
          )}

          {plan.references_used && plan.references_used.length > 0 && (
            <p className="text-sm text-gray-500">
              Baseado em planejamentos aprovados semelhantes:{" "}
              {plan.references_used.map((reference, index) => (
                <span key={reference.planning_id}>
                  {index > 0 && ", "}
                  <Link href={`/planejamentos/${reference.planning_id}`} className="underline">
                    {reference.company}
                    {reference.project ? ` — ${reference.project}` : ""} (
                    {Math.round(reference.similarity * 100)}%)
                  </Link>
                </span>
              ))}
            </p>
          )}

          <PlanResult plan={plan} />
        </section>
      )}
    </main>
  );
}

function Field({
  label,
  name,
  required,
  value,
  onChange,
}: {
  label: string;
  name: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
      />
    </div>
  );
}
