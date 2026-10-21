import { route } from "@/lib/api";
import { syncStatus } from "@/lib/sync1c";

// Starea schimbului cu 1C: cat a preluat fiecare cheie si ce modificari asteapta
export const GET = route(async () => syncStatus(), { auth: "owner" });
