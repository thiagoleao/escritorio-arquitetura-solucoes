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
  similarity?: number;
}

export type ActivityClassification = "fez_sentido" | "parcial" | "nao_fez_sentido";

export interface ActivityFeedback {
  activity_external_id: string;
  classification: ActivityClassification;
}

export interface PlanningFeedback {
  utility_score: number;
  coverage_score: number;
  sequence_quality_score: number;
  detail_level_score: number;
  objective_adherence_score: number;
  notes?: string | null;
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
    created_by: string;
    notes: string | null;
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
  activity_feedback: ActivityFeedback[];
  planning_feedback: (PlanningFeedback & { id: string }) | null;
}

export interface PlanningVersionSummary {
  version_number: number;
  created_by: string;
  notes: string | null;
  created_at: string;
}

export interface CreateVersionInput {
  milestones: Array<{
    external_id?: string | null;
    title: string;
    objective: string;
    completion_criteria: string[];
  }>;
  activities: Array<{
    external_id?: string | null;
    milestone_external_id: string;
    title: string;
    description: string;
    expected_output: string;
    dependencies: string[];
    status: "ready" | "blocked";
  }>;
  blockers: Array<{ description: string; related_activity_external_ids: string[] }>;
  activity_feedback?: ActivityFeedback[];
  planning_feedback?: PlanningFeedback;
  notes?: string;
  embedding?: number[] | null;
  created_by?: string;
}

export interface ChangeSummary {
  accepted_unchanged: number;
  edited: number;
  removed: number;
  added: number;
  moved: number;
}

export interface CreatePlanningInput {
  company: string;
  project?: string;
  context: string;
  objective: string;
  deliverables: string;
  constraints?: string;
  plan: ArchitecturePlan;
  embedding?: number[] | null;
}

export type ExecutionStatus = "todo" | "doing" | "done";

export interface BoardActivity {
  external_id: string;
  title: string;
  milestone_external_id: string;
  execution_status: ExecutionStatus;
}

export interface BoardEntry {
  planning_id: string;
  company_name: string;
  project_name: string | null;
  project_code: string;
  completion_percentage: number;
  activities: BoardActivity[];
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

export class PlannerApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseJsonOrThrow<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new PlannerApiError(response.status, `Falha ao ${action}: ${response.status} ${text}`);
  }
  return response.json() as Promise<T>;
}

export async function createPlanning(
  input: CreatePlanningInput,
  userId?: string
): Promise<{ planning_id: string; version_number: number }> {
  const response = await authenticatedFetch("/plannings", {
    method: "POST",
    body: JSON.stringify({ ...input, created_by_user_id: userId }),
  });
  return parseJsonOrThrow(response, "salvar o planejamento");
}

export async function listPlannings(
  filters: {
    company?: string;
    project?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {},
  userId?: string
): Promise<PlanningSummary[]> {
  const params = new URLSearchParams();
  if (filters.company) params.set("company", filters.company);
  if (filters.project) params.set("project", filters.project);
  if (filters.status) params.set("status", filters.status);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  if (userId) params.set("user_id", userId);

  const response = await authenticatedFetch(`/plannings?${params.toString()}`);
  return parseJsonOrThrow(response, "listar planejamentos");
}

export async function getPlanning(id: string, userId?: string): Promise<PlanningDetail> {
  const params = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const response = await authenticatedFetch(`/plannings/${id}${params}`);
  return parseJsonOrThrow(response, "buscar o planejamento");
}

export async function updatePlanningStatus(
  id: string,
  status: string,
  userId?: string
): Promise<{ planning_id: string; status: string }> {
  const response = await authenticatedFetch(`/plannings/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, user_id: userId }),
  });
  return parseJsonOrThrow(response, "atualizar o status do planejamento");
}

export async function listPlanningVersions(id: string, userId?: string): Promise<PlanningVersionSummary[]> {
  const params = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const response = await authenticatedFetch(`/plannings/${id}/versions${params}`);
  return parseJsonOrThrow(response, "listar versões do planejamento");
}

export async function createPlanningVersion(
  id: string,
  input: CreateVersionInput,
  userId?: string
): Promise<{ planning_id: string; version_number: number; change_summary: ChangeSummary }> {
  const response = await authenticatedFetch(`/plannings/${id}/versions`, {
    method: "POST",
    body: JSON.stringify({ ...input, user_id: userId }),
  });
  return parseJsonOrThrow(response, "salvar a nova versão do planejamento");
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

// Registro Service (ADR-0020): via única de escrita de empresas/projetos.
export type ResolveStatus = "matched" | "absent" | "created" | "empty";

export interface CompanySuggestion {
  id: string;
  name: string;
  score: number;
}

export interface ResolveCompanyResult {
  id: string | null;
  status: ResolveStatus;
  suggestions: CompanySuggestion[];
}

export interface ResolveProjectResult {
  id: string | null;
  status: ResolveStatus;
  suggestions: CompanySuggestion[];
}

/**
 * Resolve uma empresa pelo nome normalizado. Sem `create`, apenas consulta e devolve
 * similares (dedup soft) para o chamador confirmar antes de criar. Com `create: true`,
 * cria caso não exista. Usado na criação inline do timesheet (ADR-0013).
 */
export async function resolveCompany(name: string, create = false): Promise<ResolveCompanyResult> {
  const response = await authenticatedFetch("/companies/resolve", {
    method: "POST",
    body: JSON.stringify({ name, create }),
  });
  return parseJsonOrThrow(response, "resolver a empresa");
}

export async function resolveProject(
  companyId: string,
  name: string,
  create = false
): Promise<ResolveProjectResult> {
  const response = await authenticatedFetch("/projects/resolve", {
    method: "POST",
    body: JSON.stringify({ company_id: companyId, name, create }),
  });
  return parseJsonOrThrow(response, "resolver o projeto");
}

export async function getSimilarPlannings(
  id: string,
  limit: number = 5,
  userId?: string
): Promise<PlanningSummary[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (userId) params.set("user_id", userId);
  const response = await authenticatedFetch(`/plannings/${id}/similar?${params.toString()}`);
  return parseJsonOrThrow(response, "buscar planejamentos semelhantes");
}

export async function semanticSearchPlannings(input: {
  embedding: number[];
  company?: string;
  project?: string;
  status?: string;
  limit?: number;
  /**
   * Omit entirely for internal reference-case retrieval during plan
   * generation (searches across all users' approved plannings — the shared
   * "intelligence"). Pass the current user's id for the user-facing search
   * in /planejamentos, which must respect ownership.
   */
  scopeUserId?: string;
}): Promise<PlanningSummary[]> {
  const { scopeUserId, ...rest } = input;
  const response = await authenticatedFetch("/plannings/semantic-search", {
    method: "POST",
    body: JSON.stringify({ ...rest, scope_user_id: scopeUserId }),
  });
  return parseJsonOrThrow(response, "buscar planejamentos por similaridade");
}

export async function getBoard(
  filters: { company?: string; status?: string } = {},
  userId?: string
): Promise<BoardEntry[]> {
  const params = new URLSearchParams();
  if (filters.company) params.set("company", filters.company);
  if (filters.status) params.set("status", filters.status);
  if (userId) params.set("user_id", userId);

  const response = await authenticatedFetch(`/board?${params.toString()}`);
  return parseJsonOrThrow(response, "buscar o board");
}

export async function updateActivityExecutionStatus(
  planningId: string,
  activityExternalId: string,
  status: ExecutionStatus,
  changedBy?: string,
  userId?: string
): Promise<{ planning_id: string; activity_external_id: string; status: ExecutionStatus }> {
  const response = await authenticatedFetch(
    `/plannings/${planningId}/activities/${activityExternalId}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status, changed_by: changedBy, user_id: userId }),
    }
  );
  return parseJsonOrThrow(response, "atualizar o status de execução da atividade");
}

export type UserRole = "admin" | "member";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
  is_active?: boolean;
  password?: string;
}

export async function verifyCredentials(email: string, password: string): Promise<AuthenticatedUser | null> {
  const response = await authenticatedFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (response.status === 401) {
    return null;
  }
  return parseJsonOrThrow(response, "autenticar o usuário");
}

export async function listUsers(): Promise<AdminUser[]> {
  const response = await authenticatedFetch("/users");
  return parseJsonOrThrow(response, "listar usuários");
}

export async function createUser(input: CreateUserInput): Promise<AdminUser> {
  const response = await authenticatedFetch("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response, "criar usuário");
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<AdminUser> {
  const response = await authenticatedFetch(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(response, "atualizar usuário");
}
