"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TaskForm } from "../_form";

function Inner() {
  const customer = useSearchParams().get("customer");
  return <TaskForm presetCustomer={customer || undefined} />;
}

export default function NewTaskPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
