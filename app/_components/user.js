"use client";

import { createContext, useContext } from "react";

const UserCtx = createContext(null);

export function UserProvider({ user, children }) {
  return <UserCtx.Provider value={user}>{children}</UserCtx.Provider>;
}

export function useUser() {
  return useContext(UserCtx);
}

export const isAdmin = (u) => u?.role === "admin";
