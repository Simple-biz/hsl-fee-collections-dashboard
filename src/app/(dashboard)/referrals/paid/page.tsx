"use client";

import { Suspense } from "react";
import { ReferralsClient } from "@/components/referrals/ReferralsClient";

export default function PaidReferralsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading paid referrals…</div>}>
      <ReferralsClient paid={true} />
    </Suspense>
  );
}
