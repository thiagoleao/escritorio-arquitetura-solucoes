"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  generated: "Gerado",
  in_review: "Em revisão",
  reviewed: "Revisado",
  approved: "Aprovado",
  archived: "Arquivado",
};

export function StatusActions({ planningId, status }: { planningId: string; status: string }) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(newStatus: string) {
    setIsUpdating(true);
    setError(null);
    try {
      const response = await fetch(`/api/plannings/${planningId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Falha ao atualizar o status.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha inesperada.");
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={`rounded-full border px-2 py-0.5 text-xs backdrop-blur-md ${
          status === "approved"
            ? "border-green-300/60 bg-green-100/70 text-green-700 dark:border-green-800/50 dark:bg-green-950/50 dark:text-green-300"
            : "border-white/60 bg-white/40 dark:border-white/10 dark:bg-white/10"
        }`}
      >
        {STATUS_LABELS[status] ?? status}
      </span>
      {status !== "approved" && (
        <button
          type="button"
          disabled={isUpdating}
          onClick={() => updateStatus("approved")}
          className="glass-pill glass-pill-secondary glass-pill-sm"
        >
          Aprovar
        </button>
      )}
      {status !== "archived" && (
        <button
          type="button"
          disabled={isUpdating}
          onClick={() => updateStatus("archived")}
          className="glass-pill glass-pill-secondary glass-pill-sm"
        >
          Arquivar
        </button>
      )}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
