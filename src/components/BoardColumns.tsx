"use client";

import Link from "next/link";
import { useState } from "react";
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

interface CardData {
  planningId: string;
  projectCode: string;
  externalId: string;
  title: string;
  status: ExecutionStatus;
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
                  <DraggableCard key={cardKey(card)} card={card} pending={pendingKey === cardKey(card)} />
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

function DraggableCard({ card, pending }: { card: CardData; pending: boolean }) {
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
      <CardBody card={card} />
    </li>
  );
}

function CardBody({ card, floating }: { card: CardData; floating?: boolean }) {
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
    </div>
  );
}
