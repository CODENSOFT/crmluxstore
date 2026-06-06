"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";
import { Button, Card, Field, Input, PasswordInput } from "@/app/_components/ui";
import { Icon } from "@/app/_components/icons";

export default function LoginPage() {
  const router = useRouter();
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
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-600/30">
            <Icon name="droplet" className="h-7 w-7" strokeWidth={1.8} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            CRM Lux Store
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Produse chimice auto & spalatorii self-wash
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Email" required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@crm.local"
              required
              autoFocus
            />
          </Field>
          <Field label="Parola" required>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>

          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? "Se conecteaza…" : "Autentificare"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Cont initial: admin@crm.local / admin123
        </p>
      </Card>
    </div>
  );
}
