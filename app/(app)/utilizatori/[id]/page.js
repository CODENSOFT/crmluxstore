"use client";

import { use } from "react";
import { useApi } from "@/lib/useApi";
import { Skeleton, ErrorState } from "@/app/_components/ui";
import { UserForm } from "../_form";

export default function EditUserPage({ params }) {
  const { id } = use(params);
  const { data: u, error, reload } = useApi(`/api/users/${id}`, { keepPrevious: false });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!u) return <Skeleton className="h-96" />;
  return <UserForm key={u._id} u={u} />;
}
