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
      <header>
        <h1 className="text-2xl font-semibold">Administração de usuários</h1>
        <p className="mt-1 text-sm text-gray-500">
          Cadastre, edite e desative usuários da plataforma.
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {!error && <UserTable initialUsers={users} />}
    </main>
  );
}
