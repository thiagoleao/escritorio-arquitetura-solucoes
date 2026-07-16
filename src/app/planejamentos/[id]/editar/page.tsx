import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getPlanning } from "@/lib/planner-api/client";
import { PlanEditor } from "@/components/PlanEditor";

export const dynamic = "force-dynamic";

export default async function EditarPlanejamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  let detail;
  try {
    detail = await getPlanning(id, session?.user?.id);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Editar — {detail.planning.company_name}
            {detail.planning.project_name ? ` — ${detail.planning.project_name}` : ""}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Editando a partir da versão {detail.version.version_number}. Salvar cria uma nova versão.
          </p>
        </div>
        <Link href={`/planejamentos/${id}`} className="glass-pill glass-pill-secondary glass-pill-sm">
          Cancelar
        </Link>
      </header>

      <PlanEditor planningId={id} detail={detail} />
    </main>
  );
}
