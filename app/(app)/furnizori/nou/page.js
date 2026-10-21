"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SupplierForm } from "../_form";

function Inner() {
  const next = useSearchParams().get("next");
  // doar adrese interne (ex: /receptie/nou)
  return <SupplierForm next={next && next.startsWith("/") && !next.startsWith("//") ? next : null} />;
}

export default function NewSupplierPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
