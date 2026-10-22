import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fixeaza radacina proiectului (evita avertismentul cu mai multe lockfile-uri)
  turbopack: {
    root: path.dirname(new URL(import.meta.url).pathname),
  },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
    // Paginile vizitate raman 5 minute in memoria browserului: la revenire nu se mai asteapta serverul.
    // Sigur pentru CRM: toate paginile isi iau datele din API (useApi), care se reimprospateaza oricum.
    staleTimes: { dynamic: 300, static: 300 },
  },
  poweredByHeader: false,
  // Adrese vechi -> noi (linkuri salvate de echipa)
  async redirects() {
    return [
      { source: "/integrare", destination: "/integrari", permanent: true },
      { source: "/istoric", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
