"use client";

import { Suspense } from "react";
import { FeePetitions } from "@/components/fee-petitions/FeePetitions";

export default function FeePetitionsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading fee petitions…</div>}>
      <FeePetitions />
    </Suspense>
  );
}
