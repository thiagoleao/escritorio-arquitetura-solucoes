import Image from "next/image";
import Link from "next/link";
import { ClipboardList, History, Kanban, LogOut, Settings } from "lucide-react";
import { auth, signOut } from "@/auth";

const NAV_ITEMS = [
  { href: "/", label: "Planejador", icon: ClipboardList },
  { href: "/quadro", label: "Quadro", icon: Kanban },
  { href: "/planejamentos", label: "Histórico", icon: History },
];

const NAV_ITEM_BASE_CLASS =
  "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-all duration-150 hover:scale-[1.03] dark:text-gray-300";

const NAV_ITEM_CLASS = `${NAV_ITEM_BASE_CLASS} hover:bg-white/80 hover:text-gray-900 hover:shadow-[0_2px_8px_rgba(15,23,42,0.12)] dark:hover:bg-white/20 dark:hover:text-white dark:hover:shadow-[0_2px_10px_rgba(0,0,0,0.5)]`;

const LOGOUT_ITEM_CLASS = `${NAV_ITEM_BASE_CLASS} hover:bg-red-500/15 hover:text-red-950 hover:shadow-[0_2px_10px_rgba(239,68,68,0.3)] dark:hover:bg-red-400/25 dark:hover:text-red-50 dark:hover:shadow-[0_2px_12px_rgba(248,113,113,0.35)]`;

export async function Sidebar() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <aside className="glass-bar sticky top-0 flex h-screen w-48 shrink-0 flex-col items-center gap-6 border-r border-t-0 px-4 py-6">
      <Image src="/images/logo.png" alt="Escritório de Soluções" width={480} height={270} className="h-auto w-full" priority />
      <nav className="flex w-full flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={NAV_ITEM_CLASS}>
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex w-full flex-col gap-1">
        {session.user.role === "admin" && (
          <Link href="/admin/usuarios" className={NAV_ITEM_CLASS}>
            <Settings className="h-4 w-4 shrink-0" />
            Administração
          </Link>
        )}
        <form action={logout}>
          <button type="submit" className={`${LOGOUT_ITEM_CLASS} w-full text-left`}>
            <LogOut className="h-4 w-4 shrink-0" />
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
