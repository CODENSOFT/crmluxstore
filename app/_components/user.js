"use client";

import { createContext, useContext } from "react";
import { can } from "@/lib/permissions";

const UserCtx = createContext(null);

export function UserProvider({ user, children }) {
  return <UserCtx.Provider value={user}>{children}</UserCtx.Provider>;
}

export function useUser() {
  return useContext(UserCtx);
}

/** Verifica drepturile utilizatorului curent: const allowed = useCan(); allowed("delete") */
export function useCan() {
  const user = useContext(UserCtx);
  return (perm) => can(user, perm);
}

export const isAdmin = (u) => u?.role === "admin";
export { can };
