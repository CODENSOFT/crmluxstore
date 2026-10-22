import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { authBypassEnabled } from "@/lib/authBypass";

// Documentele de tiparit: doar cu sesiune valida (verificarea semnaturii, fara baza de date)
export default async function PrintLayout({ children }) {
  if (!authBypassEnabled() && !(await getCurrentUser())) redirect("/login");
  return children;
}
