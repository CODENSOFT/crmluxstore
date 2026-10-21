import { cookies } from "next/headers";
import { LanguageProvider } from "@/app/_components/i18n";
import { LANG_COOKIE } from "@/lib/auth";

// Pagina de autentificare in limba aleasa ultima data pe acest dispozitiv
export default async function LoginLayout({ children }) {
  const lang = (await cookies()).get(LANG_COOKIE)?.value === "ru" ? "ru" : "ro";
  return <LanguageProvider lang={lang}>{children}</LanguageProvider>;
}
