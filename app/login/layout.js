import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LanguageProvider } from "@/app/_components/i18n";
import { LANG_COOKIE, getCurrentUser } from "@/lib/auth";
import { authBypassEnabled } from "@/lib/authBypass";

// Pagina de autentificare in limba aleasa ultima data pe acest dispozitiv.
// Cine are deja o sesiune valida merge direct in CRM.
export default async function LoginLayout({ children }) {
  if (authBypassEnabled() || (await getCurrentUser())) redirect("/");
  const lang = (await cookies()).get(LANG_COOKIE)?.value === "ru" ? "ru" : "ro";
  return <LanguageProvider lang={lang}>{children}</LanguageProvider>;
}
