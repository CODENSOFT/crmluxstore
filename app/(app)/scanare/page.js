"use client";

import { Suspense } from "react";
import { useApi } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { PageHeader, Tabs } from "@/app/_components/ui";
import { ScanWorkspace } from "./_scan";
import { SessionsList } from "./_sessions";

function Inner() {
  const [f, setF] = useQueryState({ tab: "scan" });
  const { data: counts } = useApi("/api/scanner/sessions?limit=1&status=pending");
  const pending = (counts?.counts?.pending || 0) + (counts?.counts?.error || 0);
  return (
    <div className="animate-in">
      <PageHeader title="Scanare" description="Coduri de bare cu scanerul USB / Bluetooth, camera telefonului sau terminalul de colectare date." />
      <Tabs
        className="mb-5"
        value={f.tab}
        onChange={(t) => setF({ tab: t, page: "", status: "", operation: "", source: "", s: "" })}
        tabs={[
          { key: "scan", label: "Scanează" },
          { key: "sessions", label: "Sesiuni", count: pending || undefined },
        ]}
      />
      {f.tab === "scan" && <ScanWorkspace onSessionCreated={(s) => setF({ tab: "sessions", s: s._id })} />}
      {f.tab === "sessions" && <SessionsList openId={f.s || ""} onOpen={(id) => setF({ s: id }, { resetPage: false })} />}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
