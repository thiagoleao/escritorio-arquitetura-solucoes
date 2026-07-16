import { Crown, Smile } from "lucide-react";
import { auth } from "@/auth";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  member: "Membro",
};

export async function UserMenu() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  return (
    <div className="glass-bar sticky top-0 z-20 flex items-center justify-end gap-2 px-6 py-2 text-xs text-gray-500 dark:text-gray-400">
      {session.user.role === "admin" ? (
        <Crown className="h-4 w-4 text-yellow-500" />
      ) : (
        <Smile className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
      )}
      <span>
        {session.user.name ?? session.user.email}
        {" — "}
        {ROLE_LABELS[session.user.role] ?? session.user.role}
      </span>
    </div>
  );
}
