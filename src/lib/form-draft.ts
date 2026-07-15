"use client";

import { useEffect } from "react";

export function readDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Aplica um rascunho salvo depois da montagem (nunca durante o render inicial),
 * para não causar erro de hidratação: o servidor nunca tem acesso ao localStorage,
 * então ler o rascunho dentro de um inicializador de useState divergiria do HTML
 * já enviado sempre que existir um rascunho salvo.
 */
export function useDraftHydration<T>(key: string, onHydrate: (draft: T) => void): void {
  useEffect(() => {
    const draft = readDraft<T>(key);
    if (draft) onHydrate(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function useDraftPersistence<T>(key: string, value: T, enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage indisponível (modo privado, cota excedida) — ignora silenciosamente
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, JSON.stringify(value)]);
}

export function clearDraft(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}
