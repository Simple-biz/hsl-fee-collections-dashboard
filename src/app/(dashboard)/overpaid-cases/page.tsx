"use client";

import { Suspense } from "react";
import { OverpaidCases } from "@/components/overpaid-cases/OverpaidCases";

export default function OverpaidCasesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading overpaid cases…</div>}>
      <OverpaidCases />
    </Suspense>
  );
}
