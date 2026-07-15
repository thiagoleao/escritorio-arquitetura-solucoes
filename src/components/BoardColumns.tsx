"use client";

import Link from "next/link";
import { useState } from "react";
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

  async function changeStatus(card: CardData, status: ExecutionStatus) {
    const key = `${card.planningId}:${card.externalId}`;
    setPendingKey(key);
    setCards((prev) =>
      prev.map((entry) =>
        entry.planningId === card.planningId && entry.externalId === card.externalId
          ? { ...entry, status }
          : entry
      )
    );

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

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {COLUMNS.map((column) => (
        <div
          key={column.key}
          className="flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-800"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            {column.label}
          </h2>
          <ul className="flex flex-col gap-2">
            {cards
              .filter((card) => card.status === column.key)
              .map((card) => {
                const key = `${card.planningId}:${card.externalId}`;
                return (
                  <li
                    key={key}
                    className="rounded-md border border-gray-200 p-2 text-sm dark:border-gray-800"
                  >
                    <p className="text-xs text-gray-500">
                      {card.company}
                      {card.project ? ` — ${card.project}` : ""}
                    </p>
                    <p className="font-medium">{card.title}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {COLUMNS.map((target) => (
                        <button
                          key={target.key}
                          type="button"
                          disabled={target.key === card.status || pendingKey === key}
                          onClick={() => changeStatus(card, target.key)}
                          className="rounded-md border border-gray-300 px-2 py-0.5 text-xs disabled:opacity-30 dark:border-gray-700"
                        >
                          {target.label}
                        </button>
                      ))}
                    </div>
                    <Link
                      href={`/planejamentos/${card.planningId}`}
                      className="mt-1 block text-xs text-gray-400 underline"
                    >
                      ver planejamento
                    </Link>
                  </li>
                );
              })}
            {cards.filter((card) => card.status === column.key).length === 0 && (
              <li className="text-xs text-gray-400">Nenhuma atividade.</li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}
