// Intrare fara parola — DOAR la dezvoltare locala (`npm run dev`) si doar cu AUTH_BYPASS=1 in .env.local.
// In productie (next build / Vercel) NODE_ENV este "production", deci comutatorul este ignorat
// chiar daca variabila ar fi setata din greseala. API-ul v1 (1C) si webhook-urile raman protejate.
export function authBypassEnabled() {
  return process.env.NODE_ENV === "development" && process.env.AUTH_BYPASS === "1";
}
