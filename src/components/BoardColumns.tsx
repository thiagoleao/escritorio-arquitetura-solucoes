"use client";

import Link from "next/link";
import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { BoardEntry, ExecutionStatus } from "@/lib/planner-api/client";

const COLUMNS: Array<{ key: ExecutionStatus; label: string }> = [
  { key: "todo", label: "A Fazer" },
  { key: "doing", label: "Em Andamento" },
  { key: "done", label: "Concluída" },
];

interface CardData {
  planningId: string;
  company: string;
  project: string | null;
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
        company: entry.company_name,
        project: entry.project_name,
        externalId: activity.external_id,
        title: activity.title,
        status: activity.execution_status,
      }))
    )
    .sort(
      (a, b) =>
        a.company.localeCompare(b.company) || (a.project ?? "").localeCompare(b.project ?? "")
    );
}

export function BoardColumns({ board }: { board: BoardEntry[] }) {
  const [cards, setCards] = useState<CardData[]>(() => toCards(board));
  const [pendingKey, setPendingKey] = useState<string | null>(null);

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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const targetStatus = over.id as ExecutionStatus;
    const card = cards.find((entry) => cardKey(entry) === active.id);
    if (!card || card.status === targetStatus) return;
    changeStatus(card, targetStatus);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
    </DndContext>
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: key });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.4 : pending ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="relative rounded-2xl border border-white/50 bg-white/30 p-2 text-sm transition-all duration-200 hover:brightness-105 dark:border-white/10 dark:bg-white/5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {card.company}
          {card.project ? ` — ${card.project}` : ""}
        </p>
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label="Arrastar para mudar de coluna"
          className="cursor-grab touch-none rounded px-1 text-gray-400 active:cursor-grabbing"
        >
          ⠿
        </button>
      </div>
      <p className="font-medium">{card.title}</p>
      <Link href={`/planejamentos/${card.planningId}`} className="glass-link mt-1 block text-xs text-gray-400">
        ver planejamento
      </Link>
    </li>
  );
}
