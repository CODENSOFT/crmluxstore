import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-geist-mono", display: "swap" });

export const metadata = {
  title: { default: "Lux Store CRM", template: "%s · Lux Store CRM" },
  description: "CRM Lux Store — comenzi, clienți, stocuri și integrări pentru magazinul de chimie auto și echipamente pentru spălătorii.",
  robots: { index: false, follow: false },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d11" },
  ],
};

// Aplica tema salvata inainte de randare (fara „flash” de tema gresita)
const themeScript = `try{var t=localStorage.getItem("lux-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){/* stocare indisponibila (navigare privata): tema implicita */}`;

export default function RootLayout({ children }) {
  return (
    <html lang="ro" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
