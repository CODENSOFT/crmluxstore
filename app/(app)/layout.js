import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ToastProvider, ConfirmProvider } from "@/app/_components/overlay";
import { UserProvider } from "@/app/_components/user";
import Shell from "./_shell";
import { LanguageProvider } from "@/app/_components/i18n";

export default async function AppLayout({ children }) {
  let user;
  try {
    user = await getSessionUser();
  } catch (e) {
    // Baza de date indisponibila: nu redirectionam (ar crea o bucla cu /login)
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
          <p className="text-[15px] font-semibold text-fg">Serverul nu se poate conecta la baza de date</p>
          <p className="mt-2 text-[13px] text-fg-3">{e?.message}</p>
          <p className="mt-4 text-[13px] text-fg-3">Reîncărcați pagina peste câteva secunde.</p>
        </div>
      </div>
    );
  }
  if (!user) redirect("/api/auth/logout");
  return (
    <ToastProvider>
      <ConfirmProvider>
        <UserProvider user={user}>
          <LanguageProvider lang={user.lang}>
            <Shell user={user}>{children}</Shell>
          </LanguageProvider>
        </UserProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
