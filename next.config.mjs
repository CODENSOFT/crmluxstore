import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fixeaza radacina proiectului (evita avertismentul cu mai multe lockfile-uri)
  turbopack: {
    root: path.dirname(new URL(import.meta.url).pathname),
  },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
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
