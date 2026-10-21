"use client";

import { use } from "react";
import { useApi } from "@/lib/useApi";
import { Skeleton, ErrorState } from "@/app/_components/ui";
import { ProductForm } from "../../_form";

export default function EditProductPage({ params }) {
  const { id } = use(params);
  const { data: p, error, reload } = useApi(`/api/products/${id}`, { keepPrevious: false });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!p) return <Skeleton className="h-96" />;
  return <ProductForm key={p.updatedAt} product={p} />;
}
