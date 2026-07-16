"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import type { AdminUser, UserRole } from "@/lib/planner-api/client";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  member: "Membro",
};

interface NewUserForm {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

const EMPTY_FORM: NewUserForm = { name: "", email: "", password: "", role: "member" };
const PAGE_SIZE = 10;

export function UserTable({ initialUsers }: { initialUsers: AdminUser[] }) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [form, setForm] = useState<NewUserForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filteredUsers = users.filter((user) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
  });
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedUsers = filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Falha ao criar usuário.");
      }
      setUsers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha inesperada ao criar usuário.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function patchUser(id: string, input: Record<string, unknown>) {
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Falha ao atualizar usuário.");
      }
      setUsers((prev) => prev.map((user) => (user.id === id ? data : user)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha inesperada ao atualizar usuário.");
    }
  }

  async function handleResetPassword(id: string) {
    if (!newPassword.trim()) return;
    await patchUser(id, { password: newPassword });
    setResetPasswordId(null);
    setNewPassword("");
  }

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="glass-alert-error">{error}</p>}

      <form onSubmit={handleCreate} className="glass-card flex flex-wrap items-end gap-2 p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">Nome</label>
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="glass-input"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">E-mail</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            className="glass-input"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">Senha inicial</label>
          <input
            required
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            className="glass-input"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">Papel</label>
          <select
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
            className="glass-input"
          >
            <option value="member">Membro</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <button type="submit" disabled={isSubmitting} className="glass-pill glass-pill-primary">
          Adicionar usuário
        </button>
      </form>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Pesquisar por nome ou e-mail"
          className="glass-input w-full max-w-sm"
        />
        <button type="submit" className="glass-pill glass-pill-secondary">
          Pesquisar
        </button>
      </form>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/40 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
            <th className="py-2">Nome</th>
            <th className="py-2">E-mail</th>
            <th className="py-2">Papel</th>
            <th className="py-2">Status</th>
            <th className="py-2">Ações</th>
          </tr>
        </thead>
        <tbody>
          {pagedUsers.map((user) => (
            <tr key={user.id} className="border-b border-white/30 dark:border-white/5">
              <td className="py-2">{user.name}</td>
              <td className="py-2">{user.email}</td>
              <td className="py-2">
                <select
                  value={user.role}
                  onChange={(event) => patchUser(user.id, { role: event.target.value as UserRole })}
                  className="glass-input text-xs"
                >
                  <option value="member">{ROLE_LABELS.member}</option>
                  <option value="admin">{ROLE_LABELS.admin}</option>
                </select>
              </td>
              <td className="py-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs backdrop-blur-md ${
                    user.is_active
                      ? "border-green-300/60 bg-green-100/70 text-green-700 dark:border-green-800/50 dark:bg-green-950/50 dark:text-green-300"
                      : "border-white/60 bg-white/40 dark:border-white/10 dark:bg-white/10"
                  }`}
                >
                  {user.is_active ? "Ativo" : "Inativo"}
                </span>
              </td>
              <td className="py-2">
                {resetPasswordId === user.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="password"
                      placeholder="Nova senha"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="glass-input text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleResetPassword(user.id)}
                      className="glass-pill glass-pill-secondary glass-pill-sm"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResetPasswordId(null);
                        setNewPassword("");
                      }}
                      className="glass-pill glass-pill-secondary glass-pill-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <ActionsMenu
                    isActive={user.is_active}
                    onResetPassword={() => setResetPasswordId(user.id)}
                    onToggleActive={() => patchUser(user.id, { is_active: !user.is_active })}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filteredUsers.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum usuário encontrado.</p>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
            className="glass-pill glass-pill-secondary glass-pill-sm disabled:opacity-30"
          >
            Anterior
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Página {currentPage} de {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => setPage(currentPage + 1)}
            className="glass-pill glass-pill-secondary glass-pill-sm disabled:opacity-30"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}

function ActionsMenu({
  isActive,
  onResetPassword,
  onToggleActive,
}: {
  isActive: boolean;
  onResetPassword: () => void;
  onToggleActive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Mais ações"
        className="glass-pill glass-pill-secondary glass-pill-sm px-2"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="glass-card absolute right-0 z-10 mt-1 flex w-40 flex-col gap-1 p-1">
          <button
            type="button"
            onClick={() => {
              onResetPassword();
              setOpen(false);
            }}
            className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/60 dark:hover:bg-white/10"
          >
            Redefinir senha
          </button>
          <button
            type="button"
            onClick={() => {
              onToggleActive();
              setOpen(false);
            }}
            className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/60 dark:hover:bg-white/10"
          >
            {isActive ? "Inativar" : "Ativar"}
          </button>
        </div>
      )}
    </div>
  );
}
