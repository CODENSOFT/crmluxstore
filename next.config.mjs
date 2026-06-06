import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fixeaza radacina proiectului (evita avertismentul cu mai multe lockfile-uri)
  turbopack: {
    root: path.dirname(new URL(import.meta.url).pathname),
  },
};

export default nextConfig;
