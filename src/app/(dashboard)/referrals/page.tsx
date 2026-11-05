"use client";

import { Suspense } from "react";
import { ReferralsClient } from "@/components/referrals/ReferralsClient";

export default function ReferralsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading referrals…</div>}>
      <ReferralsClient />
    </Suspense>
  );
}
