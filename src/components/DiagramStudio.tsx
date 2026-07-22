"use client";

import { useState } from "react";
import { Download, Plus, Save, Send, Sparkles, Trash2 } from "lucide-react";
import type {
  DiagramGraph,
  DiagramRefineResponse,
  LaneDefinida,
  RefineTurn,
} from "@/lib/llm/diagram-refiner";

const FASE_LABELS: Record<string, string> = {
  as_is: "AS IS",
  convivencia: "Convivência",
  to_be: "TO BE",
};

const PAPEL_LABELS: Record<string, string> = {
  sistema_origem: "Sistema origem",
  orquestracao: "Orquestração",
  api_backend: "API / Backend",
  destino_monitoramento: "Destino & Monitoramento",
};

function isGraph(value: unknown): value is DiagramGraph {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { tipo?: string }).tipo === "bpmn_migracao"
  );
}

export function DiagramStudio({
  planningId,
  externalId,
  activityTitle,
  initialGraph,
}: {
  planningId: string;
  externalId: string;
  activityTitle: string;
  initialGraph: Record<string, unknown> | null;
}) {
  const [discovery, setDiscovery] = useState("");
  const [message, setMessage] = useState("");
  const [historico, setHistorico] = useState<RefineTurn[]>([]);
  const [graph, setGraph] = useState<DiagramGraph | null>(isGraph(initialGraph) ? initialGraph : null);
  const [lanes, setLanes] = useState<LaneDefinida[]>(() =>
    isGraph(initialGraph)
      ? initialGraph.lanes.map((lane) => ({ nome: lane.nome, papel: lane.papel }))
      : [{ nome: "", papel: "sistema_origem" }]
  );
  const [pendingQuestions, setPendingQuestions] = useState<string[]>([]);
  const [isRefining, setIsRefining] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSaved, setIsSaved] = useState(isGraph(initialGraph));
  const [error, setError] = useState<string | null>(null);

  const hasStarted = historico.length > 0 || graph !== null;

  async function callRefine(newMessage?: string) {
    setIsRefining(true);
    setError(null);
    const updatedHistory: RefineTurn[] = newMessage
      ? [...historico, { papel: "usuario" as const, texto: newMessage }]
      : historico;
    if (newMessage) {
      setHistorico(updatedHistory);
      setMessage("");
    }

    try {
      const response = await fetch("/api/diagram/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discovery,
          grafoAtual: graph,
          historico: updatedHistory,
          mensagem: newMessage,
          lanesDefinidas: lanes.filter((lane) => lane.nome.trim()),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Falha ao refinar o diagrama.");
      }
      const result = (await response.json()) as DiagramRefineResponse;

      const assistantText = [
        result.resumo,
        ...result.perguntas.map((pergunta, i) => `${i + 1}. ${pergunta}`),
      ]
        .filter(Boolean)
        .join("\n");
      setHistorico((prev) => [...prev, { papel: "assistente", texto: assistantText }]);
      setPendingQuestions(result.perguntas);
      if (result.grafo) {
        setGraph(result.grafo);
        setIsSaved(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao refinar o diagrama.");
    } finally {
      setIsRefining(false);
    }
  }

  async function handleSave() {
    if (!graph) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/board/activities/${planningId}/${externalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: "diagrama_arquitetura",
          artifact_data: graph,
        }),
      });
      if (!response.ok) {
        throw new Error("Falha ao salvar o grafo.");
      }
      setIsSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar o grafo.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDownload() {
    setIsDownloading(true);
    setError(null);
    try {
      const response = await fetch(`/api/board/activities/${planningId}/${externalId}/diagram`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Falha ao gerar o diagrama.");
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : "diagrama.drawio";
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar o diagrama.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="glass-card flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Texto de discovery
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Cole o mapeamento da sessão de discovery (lista numerada; use &quot;TEXTO SETA:&quot; para rótulos de
          seta). Quando algo estiver ambíguo, o assistente pergunta em vez de adivinhar.
        </p>
        <textarea
          value={discovery}
          onChange={(event) => setDiscovery(event.target.value)}
          rows={8}
          placeholder={"AS IS\n0 - Sistema origem (legado)\n1 - Job X processa... TEXTO SETA: ativa a sequência\n..."}
          className="glass-input w-full font-mono text-xs"
        />

        <h2 className="mt-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Lanes do diagrama
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Os nomes das lanes são seus — o assistente usa exatamente o que você definir aqui (o papel controla a
          cor). Se deixar vazio, ele vai perguntar em vez de batizar sozinho.
        </p>
        <ul className="flex flex-col gap-2">
          {lanes.map((lane, index) => (
            <li key={index} className="flex gap-2">
              <input
                value={lane.nome}
                onChange={(event) =>
                  setLanes((prev) =>
                    prev.map((entry, i) => (i === index ? { ...entry, nome: event.target.value } : entry))
                  )
                }
                placeholder={`Nome da lane ${index + 1} (ex.: Oracle Retail Legacy (RMS))`}
                className="glass-input w-full text-sm"
              />
              <select
                value={lane.papel}
                onChange={(event) =>
                  setLanes((prev) =>
                    prev.map((entry, i) =>
                      i === index ? { ...entry, papel: event.target.value as LaneDefinida["papel"] } : entry
                    )
                  )
                }
                className="glass-input w-56 shrink-0 text-sm"
              >
                {(Object.keys(PAPEL_LABELS) as LaneDefinida["papel"][]).map((papel) => (
                  <option key={papel} value={papel}>
                    {PAPEL_LABELS[papel]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setLanes((prev) => prev.filter((_, i) => i !== index))}
                aria-label="Remover lane"
                className="glass-pill glass-pill-secondary glass-pill-sm px-2"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setLanes((prev) => [...prev, { nome: "", papel: "destino_monitoramento" }])}
            className="glass-pill glass-pill-secondary glass-pill-sm flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar lane
          </button>
          <button
            type="button"
            onClick={() => callRefine()}
            disabled={isRefining || !discovery.trim()}
            className="glass-pill glass-pill-primary flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            {isRefining ? "Analisando..." : hasStarted ? "Reanalisar discovery" : "Analisar discovery"}
          </button>
        </div>
      </section>

      {historico.length > 0 && (
        <section className="glass-card flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Refinamento
          </h2>
          <ul className="flex flex-col gap-2">
            {historico.map((turn, index) => (
              <li
                key={index}
                className={`glass-item whitespace-pre-wrap text-sm ${
                  turn.papel === "usuario" ? "ml-8" : "mr-8"
                }`}
              >
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {turn.papel === "usuario" ? "Você" : "Assistente"}
                </span>
                {turn.texto}
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (message.trim()) callRefine(message.trim());
            }}
          >
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={
                pendingQuestions.length > 0
                  ? "Responda às perguntas do assistente..."
                  : "Peça um ajuste no grafo (ex.: mova o nó X para a lane Y)..."
              }
              className="glass-input w-full"
              disabled={isRefining}
            />
            <button
              type="submit"
              disabled={isRefining || !message.trim()}
              className="glass-pill glass-pill-secondary flex items-center gap-1"
            >
              <Send className="h-4 w-4" />
              Enviar
            </button>
          </form>
        </section>
      )}

      {graph && (
        <section className="glass-card flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Grafo estruturado
              </h2>
              <p className="mt-1 text-sm">
                {graph.titulo} — fases: {graph.fases.map((fase) => FASE_LABELS[fase]).join(", ")}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || isSaved}
                className="glass-pill glass-pill-primary flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Salvando..." : isSaved ? "Grafo salvo" : "Salvar grafo"}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading || !isSaved}
                title={!isSaved ? "Salve o grafo antes de baixar" : undefined}
                className="glass-pill glass-pill-secondary flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                {isDownloading ? "Gerando..." : "Baixar .drawio"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {graph.fases.map((fase) => {
              const lanesDaFase = graph.lanes.filter(
                (lane) => !lane.fases?.length || lane.fases.includes(fase)
              );
              const nosDaFase = graph.nos.filter((no) => !no.fases?.length || no.fases.includes(fase));
              const arestasDaFase = graph.arestas.filter(
                (aresta) => !aresta.fases?.length || aresta.fases.includes(fase)
              );
              return (
                <div key={fase} className="glass-item text-sm">
                  <h3 className="font-semibold">{FASE_LABELS[fase]}</h3>
                  <ul className="mt-2 flex flex-col gap-2">
                    {lanesDaFase.map((lane) => {
                      const nosDaLane = nosDaFase.filter((no) => no.lane === lane.id);
                      return (
                        <li key={lane.id}>
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            {lane.nome} ({PAPEL_LABELS[lane.papel]})
                          </span>
                          <ul className="mt-1 list-inside list-disc text-xs">
                            {nosDaLane.map((no) => (
                              <li key={no.id}>
                                {no.rotulo.replace(/\n/g, " ")}{" "}
                                <span className="text-gray-400">
                                  [{no.tipo}/{no.status}]
                                </span>
                              </li>
                            ))}
                            {nosDaLane.length === 0 && <li className="text-gray-400">vazia nesta fase</li>}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {arestasDaFase.length} conexão(ões)
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {error && <p className="glass-alert-error">{error}</p>}

      {!hasStarted && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nenhum grafo ainda para “{activityTitle}”. Cole o discovery acima e clique em Analisar.
        </p>
      )}
    </div>
  );
}
