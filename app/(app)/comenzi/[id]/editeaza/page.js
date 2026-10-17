"use client";

import { use } from "react";
import { useApi } from "@/lib/useApi";
import { Skeleton, ErrorState } from "@/app/_components/ui";
import OrderEditor from "../../_editor";

export default function EditOrderPage({ params }) {
  const { id } = use(params);
  const { data, error, reload } = useApi(`/api/orders/${id}`, { keepPrevious: false });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96" />;
  return <OrderEditor key={data._id} order={data} />;
}
