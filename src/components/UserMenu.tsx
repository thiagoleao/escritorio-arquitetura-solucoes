import Link from "next/link";
import { auth, signOut } from "@/auth";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  member: "Membro",
};

export async function UserMenu() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex items-center justify-end gap-3 border-b border-gray-200 px-6 py-2 text-xs text-gray-500 dark:border-gray-800">
      <span>
        {session.user.name ?? session.user.email}
        {" — "}
        {ROLE_LABELS[session.user.role] ?? session.user.role}
      </span>
      {session.user.role === "admin" && (
        <Link href="/admin/usuarios" className="underline">
          Administração
        </Link>
      )}
      <form action={logout}>
        <button type="submit" className="underline">
          Sair
        </button>
      </form>
    </div>
  );
}
