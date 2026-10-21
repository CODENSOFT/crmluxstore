"use client";

import { use } from "react";
import { SupplierView } from "../_form";

export default function SupplierPage({ params }) {
  const { id } = use(params);
  return <SupplierView id={id} />;
}
