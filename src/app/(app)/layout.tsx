import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-4">
            <Link href="/" className="text-lg font-semibold text-gray-900">
              Gestia
            </Link>
            <Link href="/pacientes" className="text-sm text-gray-600 hover:text-gray-900">
              Pacientes
            </Link>
            <Link href="/turnos" className="text-sm text-gray-600 hover:text-gray-900">
              Turnos
            </Link>
            <Link href="/gastos" className="text-sm text-gray-600 hover:text-gray-900">
              Gastos
            </Link>
            <Link href="/balance" className="text-sm text-gray-600 hover:text-gray-900">
              Balance
            </Link>
          </nav>
          <form action={logout}>
            <button type="submit" className="text-sm text-gray-600 hover:text-gray-900">
              Cerrar sesión ({user.email})
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
