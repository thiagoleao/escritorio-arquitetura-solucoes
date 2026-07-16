import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { listUsers } from "@/lib/planner-api/client";
import { UserTable } from "@/components/UserTable";

export const dynamic = "force-dynamic";

export default async function AdminUsuariosPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    notFound();
  }

  let users: Awaited<ReturnType<typeof listUsers>> = [];
  let error: string | null = null;
  try {
    users = await listUsers();
  } catch (err) {
    error = err instanceof Error ? err.message : "Falha ao carregar usuários.";
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Administração de usuários</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Cadastre, edite e desative usuários da plataforma.
          </p>
        </div>
        <Link href="/" className="glass-pill glass-pill-secondary glass-pill-sm">
          Voltar
        </Link>
      </header>

      {error && <p className="glass-alert-error">{error}</p>}

      {!error && <UserTable initialUsers={users} />}
    </main>
  );
}
