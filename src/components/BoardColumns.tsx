"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Download, Workflow, X } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { ActivityType, BoardEntry, ExecutionStatus } from "@/lib/planner-api/client";

const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  diagrama_arquitetura: "Diagrama de arquitetura",
  documento_adr: "Documento ADR",
  documento_int: "Documento de integração (INT)",
};

const ARTIFACT_DATA_EXAMPLES: Record<ActivityType, Record<string, unknown>> = {
  diagrama_arquitetura: {},
  documento_adr: {
    codigo: "ADR-XXX-001",
    titulo: "",
    titulo_rodape: "",
    status: "Proposta",
    data: "",
    dominio: "",
    autores: "",
    aprovadores: "",
    contexto: "",
    subsecoes_contexto: [{ titulo: "", paragrafos: [""], bullets: [""] }],
    decisao: "",
    subsecoes_decisao: [{ titulo: "", paragrafos: [""], bullets: [""] }],
    alternativas: [{ nome: "", descricao: "" }],
    opcao_a_nome: "Opção A",
    opcao_b_nome: "Opção B",
    tabela_comparativa: [{ criterio: "", opcao_a: "", opcao_b: "" }],
    fluxo_nome: "",
    fluxo_intro: "",
    fluxo_passos: [{ passo: "1", acao: "", descricao: "" }],
    fluxo_subsecoes: [{ titulo: "", paragrafos: [""], bullets: [""] }],
    consequencias_positivas: [""],
    consequencias_negativas: [""],
    riscos: [{ descricao: "", impacto: "", mitigacao: "" }],
    lacunas_tecnicas: [""],
    revisao_e_evolucao: [""],
  },
  documento_int: {
    codigo: "INT-XXX-001",
    titulo: "",
    titulo_rodape: "",
    status: "Em levantamento",
    versao: "1.0",
    data: "",
    adr_referencia: "",
    prazo_rollout: "",
    solicitantes: "",
    autores: "",
    objetivo: "",
    resumo_por_responsavel: [{ responsavel: "", itens: "", prazo: "" }],
    itens_em_aberto: [{ numero: "", item: "", responsavel: "", prazo: "", status: "PENDENTE", observacoes: "" }],
    pode_iniciar_agora: [{ tarefa: "", bloqueado_por: "" }],
    itens_definidos: [{ titulo: "", paragrafos: [""], bullets: [""] }],
    proximos_passos: [""],
    proximos_passos_nota: "",
    controle_versoes: [{ versao: "", data: "", alteracao: "", autor: "" }],
  },
};

const COLUMNS: Array<{ key: ExecutionStatus; label: string }> = [
  { key: "todo", label: "A Fazer" },
  { key: "doing", label: "Em Andamento" },
  { key: "done", label: "Concluída" },
];

const EXECUTION_LABELS: Record<ExecutionStatus, string> = {
  todo: "A Fazer",
  doing: "Em Andamento",
  done: "Concluída",
};

interface CardData {
  planningId: string;
  projectCode: string;
  externalId: string;
  title: string;
  status: ExecutionStatus;
  milestoneExternalId: string;
  description: string;
  expectedOutput: string;
  dependencies: string[];
  readyStatus: "ready" | "blocked";
  activityType: ActivityType | null;
  artifactData: Record<string, unknown> | null;
}

function cardKey(card: CardData): string {
  return `${card.planningId}:${card.externalId}`;
}

function toCards(board: BoardEntry[]): CardData[] {
  return board
    .flatMap((entry) =>
      entry.activities.map((activity) => ({
        planningId: entry.planning_id,
        projectCode: entry.project_code,
        externalId: activity.external_id,
        title: activity.title,
        status: activity.execution_status,
        milestoneExternalId: activity.milestone_external_id,
        description: activity.description,
        expectedOutput: activity.expected_output,
        dependencies: activity.dependencies,
        readyStatus: activity.status,
        activityType: activity.activity_type,
        artifactData: activity.artifact_data,
      }))
    )
    .sort((a, b) => a.projectCode.localeCompare(b.projectCode));
}

interface ProgressEntry {
  planningId: string;
  projectCode: string;
  projectName: string | null;
  percentage: number;
}

function computeProgress(board: BoardEntry[], cards: CardData[]): ProgressEntry[] {
  return board
    .map((entry) => {
      const entryCards = cards.filter((card) => card.planningId === entry.planning_id);
      const total = entryCards.length;
      const done = entryCards.filter((card) => card.status === "done").length;
      const doing = entryCards.filter((card) => card.status === "doing").length;
      const percentage = total ? Math.round(((done + doing * 0.5) / total) * 100) : 0;
      return {
        planningId: entry.planning_id,
        projectCode: entry.project_code,
        projectName: entry.project_name,
        percentage,
      };
    })
    .sort((a, b) => a.projectCode.localeCompare(b.projectCode));
}

export function BoardColumns({ board }: { board: BoardEntry[] }) {
  const [cards, setCards] = useState<CardData[]>(() => toCards(board));
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<CardData | null>(null);
  const [detailCard, setDetailCard] = useState<CardData | null>(null);
  const progress = computeProgress(board, cards);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  async function changeStatus(card: CardData, status: ExecutionStatus) {
    const key = cardKey(card);
    setPendingKey(key);
    setCards((prev) => prev.map((entry) => (cardKey(entry) === key ? { ...entry, status } : entry)));

    try {
      const response = await fetch(
        `/api/board/activities/${card.planningId}/${card.externalId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      if (!response.ok) {
        throw new Error("Falha ao atualizar status");
      }
    } catch {
      window.location.reload();
    } finally {
      setPendingKey(null);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const card = cards.find((entry) => cardKey(entry) === event.active.id);
    setActiveCard(card ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;
    const targetStatus = over.id as ExecutionStatus;
    const card = cards.find((entry) => cardKey(entry) === active.id);
    if (!card || card.status === targetStatus) return;
    changeStatus(card, targetStatus);
  }

  function handleTaskSaved(updated: CardData) {
    setCards((prev) => prev.map((entry) => (cardKey(entry) === cardKey(updated) ? updated : entry)));
    setDetailCard(updated);
  }

  return (
    <div className="flex flex-col gap-6">
      {progress.length > 0 && (
        <section className="glass-card flex flex-col gap-2 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Progresso por projeto
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {progress.map((entry) => (
              <li key={entry.planningId} className="flex items-center gap-4">
                <Link href={`/planejamentos/${entry.planningId}`} className="glass-link max-w-[45%] shrink-0 truncate">
                  {entry.projectCode}
                  {entry.projectName ? ` — ${entry.projectName}` : ""}
                </Link>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/40 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-300 dark:bg-indigo-400"
                    style={{ width: `${entry.percentage}%` }}
                  />
                </div>
                <span className="shrink-0 text-gray-500 dark:text-gray-400">{entry.percentage}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DndContext id="board-dnd" sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {COLUMNS.map((column) => {
            const columnCards = cards.filter((card) => card.status === column.key);
            return (
              <DroppableColumn key={column.key} columnKey={column.key} label={column.label}>
                {columnCards.map((card) => (
                  <DraggableCard
                    key={cardKey(card)}
                    card={card}
                    pending={pendingKey === cardKey(card)}
                    onOpenDetail={() => setDetailCard(card)}
                  />
                ))}
                {columnCards.length === 0 && <li className="text-xs text-gray-400">Nenhuma atividade.</li>}
              </DroppableColumn>
            );
          })}
        </div>
        <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
          {activeCard ? <CardBody card={activeCard} floating /> : null}
        </DragOverlay>
      </DndContext>

      {detailCard && (
        <TaskDetailModal card={detailCard} onClose={() => setDetailCard(null)} onSaved={handleTaskSaved} />
      )}
    </div>
  );
}

function DroppableColumn({
  columnKey,
  label,
  children,
}: {
  columnKey: ExecutionStatus;
  label: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnKey });
  return (
    <div
      ref={setNodeRef}
      className={`glass-card flex flex-col gap-3 p-3 ${isOver ? "ring-2 ring-indigo-400/60 dark:ring-indigo-500/50" : ""}`}
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</h2>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function DraggableCard({
  card,
  pending,
  onOpenDetail,
}: {
  card: CardData;
  pending: boolean;
  onOpenDetail: () => void;
}) {
  const key = cardKey(card);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: key });

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.35 : pending ? 0.6 : 1 }}
      className="relative cursor-grab touch-none rounded-2xl border border-white/70 bg-white/85 p-2 pb-9 text-sm shadow-[0_2px_10px_rgba(15,23,42,0.15)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(15,23,42,0.2)] active:cursor-grabbing dark:border-white/15 dark:bg-white/15 dark:shadow-[0_2px_12px_rgba(0,0,0,0.5)] dark:hover:shadow-[0_8px_20px_rgba(0,0,0,0.6)]"
    >
      <CardBody card={card} onOpenDetail={onOpenDetail} />
    </li>
  );
}

function CardBody({
  card,
  floating,
  onOpenDetail,
}: {
  card: CardData;
  floating?: boolean;
  onOpenDetail?: () => void;
}) {
  return (
    <div
      className={
        floating
          ? "glass-card w-72 cursor-grabbing p-2 text-sm shadow-2xl"
          : undefined
      }
    >
      <Link
        href={`/planejamentos/${card.planningId}`}
        onPointerDown={(event) => event.stopPropagation()}
        className="glass-link text-xs font-semibold text-gray-500 dark:text-gray-400"
      >
        {card.projectCode}
      </Link>
      <p className="mt-1 font-medium">{card.title}</p>
      {onOpenDetail && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onOpenDetail}
          aria-label="Ver mais detalhes da tarefa"
          className="glass-pill glass-pill-secondary group absolute bottom-1.5 right-1.5 flex items-center gap-1 px-2 py-1 text-xs"
        >
          <span className="hidden sm:inline">Ver mais</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:animate-nudge-right" />
        </button>
      )}
    </div>
  );
}

function TaskDetailModal({
  card,
  onClose,
  onSaved,
}: {
  card: CardData;
  onClose: () => void;
  onSaved: (card: CardData) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [expectedOutput, setExpectedOutput] = useState(card.expectedOutput);
  const [dependencies, setDependencies] = useState(card.dependencies.join(", "));
  const [activityType, setActivityType] = useState<ActivityType | "">(card.activityType ?? "");
  const [artifactDataText, setArtifactDataText] = useState(
    card.artifactData ? JSON.stringify(card.artifactData, null, 2) : ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancelEditing() {
    setIsEditing(false);
    setTitle(card.title);
    setDescription(card.description);
    setExpectedOutput(card.expectedOutput);
    setDependencies(card.dependencies.join(", "));
    setActivityType(card.activityType ?? "");
    setArtifactDataText(card.artifactData ? JSON.stringify(card.artifactData, null, 2) : "");
    setError(null);
  }

  function handleActivityTypeChange(value: ActivityType | "") {
    setActivityType(value);
    if (value && !artifactDataText.trim()) {
      setArtifactDataText(JSON.stringify(ARTIFACT_DATA_EXAMPLES[value], null, 2));
    }
  }

  async function handleSave() {
    setError(null);

    let parsedArtifactData: Record<string, unknown> | null = null;
    if (activityType && artifactDataText.trim()) {
      try {
        parsedArtifactData = JSON.parse(artifactDataText);
      } catch {
        setError("Os dados do artefato precisam ser um JSON válido.");
        return;
      }
    }

    setIsSaving(true);
    const newDependencies = dependencies
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      const response = await fetch(`/api/board/activities/${card.planningId}/${card.externalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          expected_output: expectedOutput,
          dependencies: newDependencies,
          activity_type: activityType || null,
          artifact_data: parsedArtifactData,
        }),
      });
      if (!response.ok) {
        throw new Error("Falha ao salvar");
      }
      onSaved({
        ...card,
        title,
        description,
        expectedOutput,
        dependencies: newDependencies,
        activityType: activityType || null,
        artifactData: parsedArtifactData,
      });
      setIsEditing(false);
    } catch {
      setError("Falha ao salvar as alterações. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDownloadDocument() {
    setIsDownloading(true);
    setError(null);
    try {
      const response = await fetch(`/api/board/activities/${card.planningId}/${card.externalId}/document`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Falha ao gerar o documento");
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : "documento.docx";
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar o documento. Tente novamente.");
    } finally {
      setIsDownloading(false);
    }
  }

  const canGenerateDocument =
    !isEditing && (card.activityType === "documento_adr" || card.activityType === "documento_int") && card.artifactData;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl border border-white/70 bg-white/95 p-6 shadow-2xl dark:border-white/15 dark:bg-white/15 dark:shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Link href={`/planejamentos/${card.planningId}`} className="glass-link text-xs font-semibold text-gray-500 dark:text-gray-400">
              {card.projectCode}
            </Link>
            {isEditing ? (
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="glass-input mt-1 w-full text-base font-semibold"
              />
            ) : (
              <h2 className="mt-1 text-lg font-semibold">{card.title}</h2>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="glass-pill glass-pill-secondary glass-pill-sm px-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/60 bg-white/40 px-2 py-0.5 dark:border-white/10 dark:bg-white/10">
            {EXECUTION_LABELS[card.status]}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 backdrop-blur-md ${
              card.readyStatus === "blocked"
                ? "border-red-300/60 bg-red-100/70 text-red-700 dark:border-red-800/50 dark:bg-red-950/50 dark:text-red-300"
                : "border-green-300/60 bg-green-100/70 text-green-700 dark:border-green-800/50 dark:bg-green-950/50 dark:text-green-300"
            }`}
          >
            {card.readyStatus === "blocked" ? "Bloqueada" : "Pronta"}
          </span>
          <span className="rounded-full border border-white/60 bg-white/40 px-2 py-0.5 text-gray-500 dark:border-white/10 dark:bg-white/10 dark:text-gray-400">
            Marco {card.milestoneExternalId}
          </span>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Descrição</h3>
          {isEditing ? (
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="glass-input mt-1 w-full text-sm"
            />
          ) : (
            <p className="mt-1 text-sm">{card.description}</p>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Resultado esperado
          </h3>
          {isEditing ? (
            <textarea
              value={expectedOutput}
              onChange={(event) => setExpectedOutput(event.target.value)}
              rows={2}
              className="glass-input mt-1 w-full text-sm"
            />
          ) : (
            <p className="mt-1 text-sm">{card.expectedOutput}</p>
          )}
        </div>

        {(isEditing || card.dependencies.length > 0) && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Dependências
            </h3>
            {isEditing ? (
              <input
                value={dependencies}
                onChange={(event) => setDependencies(event.target.value)}
                placeholder="Separadas por vírgula"
                className="glass-input mt-1 w-full text-sm"
              />
            ) : (
              <p className="mt-1 text-sm">{card.dependencies.join(", ")}</p>
            )}
          </div>
        )}

        {isEditing && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Tipo de artefato
            </h3>
            <select
              value={activityType}
              onChange={(event) => handleActivityTypeChange(event.target.value as ActivityType | "")}
              className="glass-input mt-1 w-full text-sm"
            >
              <option value="">Nenhum</option>
              {(Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[]).map((type) => (
                <option key={type} value={type}>
                  {ACTIVITY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
        )}

        {isEditing && (activityType === "documento_adr" || activityType === "documento_int") && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Dados do documento (JSON)
            </h3>
            <textarea
              value={artifactDataText}
              onChange={(event) => setArtifactDataText(event.target.value)}
              rows={10}
              className="glass-input mt-1 w-full font-mono text-xs"
            />
          </div>
        )}

        {!isEditing && card.activityType && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Tipo de artefato
            </h3>
            <p className="mt-1 text-sm">{ACTIVITY_TYPE_LABELS[card.activityType]}</p>
          </div>
        )}

        {error && <p className="glass-alert-error">{error}</p>}

        <div className="flex justify-end gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={cancelEditing}
                disabled={isSaving}
                className="glass-pill glass-pill-secondary glass-pill-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="glass-pill glass-pill-primary glass-pill-sm"
              >
                {isSaving ? "Salvando..." : "Salvar"}
              </button>
            </>
          ) : (
            <>
              {card.activityType === "diagrama_arquitetura" && (
                <Link
                  href={`/diagramas/${card.planningId}/${card.externalId}`}
                  className="glass-pill glass-pill-secondary glass-pill-sm flex items-center gap-1"
                >
                  <Workflow className="h-3.5 w-3.5" />
                  Gerar diagrama
                </Link>
              )}
              {canGenerateDocument && (
                <button
                  type="button"
                  onClick={handleDownloadDocument}
                  disabled={isDownloading}
                  className="glass-pill glass-pill-secondary glass-pill-sm flex items-center gap-1"
                >
                  <Download className="h-3.5 w-3.5" />
                  {isDownloading ? "Gerando..." : "Baixar documento"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="glass-pill glass-pill-secondary glass-pill-sm"
              >
                Editar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
