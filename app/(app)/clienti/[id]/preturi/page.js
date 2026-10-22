"use client";

import { use } from "react";
import { useApi } from "@/lib/useApi";
import { Skeleton, ErrorState } from "@/app/_components/ui";
import { PricesEditor } from "../../_prices";

export default function CustomerPricesPage({ params }) {
  const { id } = use(params);
  const { data: c, error, reload } = useApi(`/api/customers/${id}`, { keepPrevious: false });
  const { data: rows, error: rowsError, reload: reloadRows } = useApi(`/api/customers/${id}/prices`, { keepPrevious: false });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (rowsError) return <ErrorState error={rowsError} onRetry={reloadRows} />;
  if (!c || !rows) return <Skeleton className="h-96" />;
  return <PricesEditor customer={c} rows={rows} />;
}
