import { Inter } from "next/font/google";
import "./globals.css";
import ServiceWorkerCleanup from "./_components/ServiceWorkerCleanup";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "CRM Lux Store — Produse chimice auto & spalatorii self-wash",
  description:
    "Sistem CRM pentru gestiunea produselor, depozitelor, comenzilor si sarcinilor.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ro" className={`h-full ${inter.variable}`}>
      <body className="min-h-full">
        <ServiceWorkerCleanup />
        {children}
      </body>
    </html>
  );
}
