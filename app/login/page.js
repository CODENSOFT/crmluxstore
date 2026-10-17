"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiPost } from "@/lib/client";
import { Button, Field, Input, PasswordInput } from "@/app/_components/ui";
import { Drop, WarningCircle, ShieldCheck, Receipt, Stack, PlugsConnected } from "@/app/_components/icons";

const FEATURES = [
  { icon: Receipt, title: "Comenzi din magazin, site și B2B", text: "Un singur flux, de la comandă la factură și încasare." },
  { icon: Stack, title: "Stoc corect pe fiecare depozit", text: "Recepții, transferuri, casări și inventariere cu registru complet." },
  { icon: PlugsConnected, title: "Conectat direct la luxstore.md și 1C", text: "Fără servicii intermediare — sincronizare automată." },
];

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiPost("/api/auth/login", { email, password });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nume@luxstore.md"
          required
          autoFocus
          className="h-10"
        />
      </Field>
      <Field label="Parolă" htmlFor="password">
        <PasswordInput
          id="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Parola contului"
          required
          className="h-10"
        />
      </Field>
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-bad-soft px-3 py-2.5 text-[13px] text-bad">
          <WarningCircle size={17} weight="fill" className="mt-px shrink-0" />
          {error}
        </div>
      )}
      <Button type="submit" variant="primary" size="lg" loading={loading} full disabled={!email || !password}>
        Intră în cont
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="relative hidden overflow-hidden bg-[#0d1424] p-10 text-white lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              "radial-gradient(1200px 500px at 0% 100%, rgb(36 87 212 / 0.45), transparent 60%), radial-gradient(600px 300px at 100% 0%, rgb(27 175 122 / 0.16), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#2457d4]">
            <Drop size={22} weight="fill" />
          </span>
          <div className="leading-tight">
            <div className="text-[16px] font-semibold tracking-tight">Lux Store</div>
            <div className="text-[12.5px] text-white/60">Piese, accesorii și chimie pentru spălătorii auto</div>
          </div>
        </div>
        <div className="relative mt-auto max-w-md">
          <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.03em]">Toată activitatea magazinului, într-un singur loc.</h1>
          <ul className="mt-8 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/15">
                  <f.icon size={18} />
                </span>
                <span>
                  <span className="block text-[14px] font-medium">{f.title}</span>
                  <span className="block text-[13px] text-white/60">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mt-12 text-[12px] text-white/45">Chișinău, str. Lunca Bîcului 23 · luxstore.md</div>
      </section>

      <section className="flex items-center justify-center bg-bg px-5 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent text-white">
              <Drop size={19} weight="fill" />
            </span>
            <span className="text-[16px] font-semibold tracking-tight text-fg">Lux Store CRM</span>
          </div>
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-fg">Autentificare</h2>
          <p className="mb-7 mt-1.5 text-[13.5px] text-fg-3">Introduceți datele contului primit de la administrator.</p>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
          <p className="mt-8 flex items-center gap-2 text-[12px] text-fg-4">
            <ShieldCheck size={15} />
            Conexiune securizată. Sesiunea expiră după 7 zile.
          </p>
        </div>
      </section>
    </div>
  );
}
