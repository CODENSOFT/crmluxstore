"use client";

import { use } from "react";
import { useApi } from "@/lib/useApi";
import { Skeleton, ErrorState } from "@/app/_components/ui";
import { TaskForm } from "../_form";

export default function TaskPage({ params }) {
  const { id } = use(params);
  const { data: t, error, reload } = useApi(`/api/tasks/${id}`, { keepPrevious: false });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!t) return <Skeleton className="h-96" />;
  return <TaskForm key={t.updatedAt} task={t} />;
}
