import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ToastProvider } from "@/app/_components/ui";
import { UserProvider } from "@/app/_components/user";
import Shell from "./_shell";

export default async function AppLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  return (
    <ToastProvider>
      <UserProvider user={safeUser}>
        <Shell user={safeUser}>{children}</Shell>
      </UserProvider>
    </ToastProvider>
  );
}
