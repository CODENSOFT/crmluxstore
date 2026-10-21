"use client";

import { createContext, useContext } from "react";
import { can, isAdminUser, isOwner } from "@/lib/permissions";

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

export const isAdmin = (u) => isAdminUser(u);
export { can, isOwner };
