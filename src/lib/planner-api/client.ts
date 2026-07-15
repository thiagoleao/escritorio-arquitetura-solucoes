import { GoogleAuth } from "google-auth-library";
import type { ArchitecturePlan } from "@/lib/schema";

export interface Company {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface PlanningSummary {
  id: string;
  title: string | null;
  status: string;
  current_version: number;
  created_at: string;
  updated_at: string;
  company_name: string;
  project_name: string | null;
}

export interface PlanningDetail {
  planning: PlanningSummary & {
    company_id: string;
    project_id: string | null;
    context: string;
    objective: string;
    deliverables: string;
    constraints: string | null;
  };
  version: {
    id: string;
    version_number: number;
    summary: string;
    assumptions: string[];
    missing_information: string[];
  };
  milestones: Array<{ external_id: string; title: string; objective: string; completion_criteria: string[] }>;
  activities: Array<{
    external_id: string;
    milestone_external_id: string;
    title: string;
    description: string;
    expected_output: string;
    dependencies: string[];
    status: "ready" | "blocked";
  }>;
  blockers: Array<{ description: string; related_activity_external_ids: string[] }>;
}

export interface CreatePlanningInput {
  company: string;
  project?: string;
  context: string;
  objective: string;
  deliverables: string;
  constraints?: string;
  plan: ArchitecturePlan;
}

let cachedAuth: GoogleAuth | null = null;

function getBaseUrl(): string {
  const url = process.env.PLANNER_API_URL;
  if (!url) {
    throw new Error("PLANNER_API_URL não configurada.");
  }
  return url;
}

async function authenticatedFetch(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = getBaseUrl();
  const apiKey = process.env.PLANNER_API_KEY;
  if (!apiKey) {
    throw new Error("PLANNER_API_KEY não configurada.");
  }
  const url = `${baseUrl}${path}`;

  if (!cachedAuth) {
    cachedAuth = new GoogleAuth();
  }
  const idTokenClient = await cachedAuth.getIdTokenClient(baseUrl);
  const authHeaders = await idTokenClient.getRequestHeaders(url);

  const headers = new Headers(authHeaders);
  headers.set("X-Service-Api-Key", apiKey);
  if (init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }

  return fetch(url, { ...init, headers });
}

async function parseJsonOrThrow<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao ${action}: ${response.status} ${text}`);
  }
  return response.json() as Promise<T>;
}

export async function createPlanning(input: CreatePlanningInput): Promise<{ planning_id: string; version_number: number }> {
  const response = await authenticatedFetch("/plannings", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response, "salvar o planejamento");
}

export async function listPlannings(filters: {
  company?: string;
  project?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<PlanningSummary[]> {
  const params = new URLSearchParams();
  if (filters.company) params.set("company", filters.company);
  if (filters.project) params.set("project", filters.project);
  if (filters.status) params.set("status", filters.status);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));

  const response = await authenticatedFetch(`/plannings?${params.toString()}`);
  return parseJsonOrThrow(response, "listar planejamentos");
}

export async function getPlanning(id: string): Promise<PlanningDetail> {
  const response = await authenticatedFetch(`/plannings/${id}`);
  return parseJsonOrThrow(response, "buscar o planejamento");
}

export async function listCompanies(query: string = ""): Promise<Company[]> {
  const response = await authenticatedFetch(`/companies?q=${encodeURIComponent(query)}`);
  return parseJsonOrThrow(response, "listar empresas");
}

export async function listProjects(companyId: string, query: string = ""): Promise<Project[]> {
  const response = await authenticatedFetch(
    `/projects?company_id=${encodeURIComponent(companyId)}&q=${encodeURIComponent(query)}`
  );
  return parseJsonOrThrow(response, "listar projetos");
}
