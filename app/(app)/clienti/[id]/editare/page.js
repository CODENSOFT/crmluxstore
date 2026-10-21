"use client";

import { use } from "react";
import { useApi } from "@/lib/useApi";
import { Skeleton, ErrorState } from "@/app/_components/ui";
import { CustomerForm } from "../../_form";

export default function EditCustomerPage({ params }) {
  const { id } = use(params);
  const { data: c, error, reload } = useApi(`/api/customers/${id}`, { keepPrevious: false });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!c) return <Skeleton className="h-96" />;
  return <CustomerForm key={c.updatedAt} customer={c} />;
}
