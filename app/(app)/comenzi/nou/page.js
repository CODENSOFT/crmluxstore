"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/lib/useApi";
import { Skeleton } from "@/app/_components/ui";
import OrderEditor from "../_editor";

function NewOrder() {
  const sp = useSearchParams();
  const from = sp.get("from");
  const customerId = sp.get("customer");
  const { data: source, loading } = useApi(from ? `/api/orders/${from}` : null);
  const { data: customer, loading: lc } = useApi(customerId ? `/api/customers/${customerId}` : null);
  if ((from && loading && !source) || (customerId && lc && !customer)) return <Skeleton className="h-96" />;
  const template = source ? { customer: source.customer, customerName: source.customerName, customerPhone: source.customerPhone, items: source.items } : customer ? { customer } : null;
  return <OrderEditor key={from || customerId || "new"} template={template} />;
}

export default function NewOrderPage() {
  return (
    <Suspense>
      <NewOrder />
    </Suspense>
  );
}
