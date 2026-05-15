"use client";

import { Suspense } from "react";
import { OverpaidCases } from "@/components/overpaid-cases/OverpaidCases";

export default function OverpaidCasesPage() {
  return (
    <Suspense fallback={null}>
      <OverpaidCases />
    </Suspense>
  );
}
