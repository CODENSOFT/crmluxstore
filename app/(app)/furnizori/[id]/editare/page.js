"use client";

import { use } from "react";
import { useApi } from "@/lib/useApi";
import { Skeleton, ErrorState } from "@/app/_components/ui";
import { SupplierForm } from "../../_form";

export default function EditSupplierPage({ params }) {
  const { id } = use(params);
  const { data: s, error, reload } = useApi(`/api/suppliers/${id}`, { keepPrevious: false });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!s) return <Skeleton className="h-96" />;
  return <SupplierForm key={s.updatedAt} supplier={s} />;
}
