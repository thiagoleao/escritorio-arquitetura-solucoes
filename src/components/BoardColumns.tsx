"use client";

import Link from "next/link";
import { useState } from "react";
import { Info, X } from "lucide-react";
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
import type { BoardEntry, ExecutionStatus } from "@/lib/planner-api/client";

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

      {detailCard && <TaskDetailModal card={detailCard} onClose={() => setDetailCard(null)} />}
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
      className="cursor-grab touch-none rounded-2xl border border-white/70 bg-white/85 p-2 text-sm shadow-[0_2px_10px_rgba(15,23,42,0.15)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(15,23,42,0.2)] active:cursor-grabbing dark:border-white/15 dark:bg-white/15 dark:shadow-[0_2px_12px_rgba(0,0,0,0.5)] dark:hover:shadow-[0_8px_20px_rgba(0,0,0,0.6)]"
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
          className="glass-link mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
        >
          <Info className="h-3.5 w-3.5" />
          Ver mais
        </button>
      )}
    </div>
  );
}

function TaskDetailModal({ card, onClose }: { card: CardData; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href={`/planejamentos/${card.planningId}`} className="glass-link text-xs font-semibold text-gray-500 dark:text-gray-400">
              {card.projectCode}
            </Link>
            <h2 className="mt-1 text-lg font-semibold">{card.title}</h2>
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
          <p className="mt-1 text-sm">{card.description}</p>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Resultado esperado
          </h3>
          <p className="mt-1 text-sm">{card.expectedOutput}</p>
        </div>

        {card.dependencies.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Dependências
            </h3>
            <p className="mt-1 text-sm">{card.dependencies.join(", ")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
