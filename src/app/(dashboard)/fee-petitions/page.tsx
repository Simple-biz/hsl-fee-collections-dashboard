"use client";

import { Suspense } from "react";
import { FeePetitions } from "@/components/fee-petitions/FeePetitions";

export default function FeePetitionsPage() {
  return (
    <Suspense fallback={null}>
      <FeePetitions />
    </Suspense>
  );
}
