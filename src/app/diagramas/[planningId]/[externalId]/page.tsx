import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getBoard } from "@/lib/planner-api/client";
import { DiagramStudio } from "@/components/DiagramStudio";

export const dynamic = "force-dynamic";

export default async function DiagramaPage({
  params,
}: {
  params: Promise<{ planningId: string; externalId: string }>;
}) {
  const { planningId, externalId } = await params;
  const session = await auth();

  const board = await getBoard({}, session?.user?.id);
  const entry = board.find((item) => item.planning_id === planningId);
  const activity = entry?.activities.find((item) => item.external_id === externalId);

  if (!entry || !activity) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Diagrama da atividade</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {entry.project_code} — {activity.title}
          </p>
        </div>
        <Link href="/quadro" className="glass-pill glass-pill-secondary">
          Voltar ao quadro
        </Link>
      </header>

      <DiagramStudio
        planningId={planningId}
        externalId={externalId}
        activityTitle={activity.title}
        initialGraph={activity.artifact_data}
      />
    </main>
  );
}
