"use client";

import { useState } from "react";
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

export function UserTable({ initialUsers }: { initialUsers: AdminUser[] }) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [form, setForm] = useState<NewUserForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

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

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3 dark:border-gray-800">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">Nome</label>
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">E-mail</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">Senha inicial</label>
          <input
            required
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium">Papel</label>
          <select
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
            className="rounded-md border border-gray-300 p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="member">Membro</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          Adicionar usuário
        </button>
      </form>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
            <th className="py-2">Nome</th>
            <th className="py-2">E-mail</th>
            <th className="py-2">Papel</th>
            <th className="py-2">Status</th>
            <th className="py-2">Ações</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-gray-100 dark:border-gray-900">
              <td className="py-2">{user.name}</td>
              <td className="py-2">{user.email}</td>
              <td className="py-2">
                <select
                  value={user.role}
                  onChange={(event) => patchUser(user.id, { role: event.target.value as UserRole })}
                  className="rounded-md border border-gray-300 p-1 text-xs dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="member">{ROLE_LABELS.member}</option>
                  <option value="admin">{ROLE_LABELS.admin}</option>
                </select>
              </td>
              <td className="py-2">
                <button
                  type="button"
                  onClick={() => patchUser(user.id, { is_active: !user.is_active })}
                  className="rounded-full border border-gray-300 px-2 py-0.5 text-xs dark:border-gray-700"
                >
                  {user.is_active ? "Ativo" : "Inativo"}
                </button>
              </td>
              <td className="py-2">
                {resetPasswordId === user.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="password"
                      placeholder="Nova senha"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="rounded-md border border-gray-300 p-1 text-xs dark:border-gray-700 dark:bg-gray-900"
                    />
                    <button
                      type="button"
                      onClick={() => handleResetPassword(user.id)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResetPasswordId(null);
                        setNewPassword("");
                      }}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setResetPasswordId(user.id)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
                  >
                    Redefinir senha
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
