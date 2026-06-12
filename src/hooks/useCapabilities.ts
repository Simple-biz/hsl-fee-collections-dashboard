"use client";

import { useSession } from "next-auth/react";
import {
  roleCapabilityDefaults,
  type CapabilityKey,
} from "@/lib/access/capabilities";

/**
 * Client-side access to the signed-in user's effective capabilities (baked into
 * the session at sign-in). Sessions minted before capabilities existed have no
 * `capabilities` array — fall back to the role defaults so the UI still gates
 * correctly until their next login. While the session is loading/absent this
 * resolves to the most restrictive (member) defaults, so actions stay hidden
 * rather than flashing in then disappearing.
 *
 * UI gating is convenience only — the API routes are the real authority.
 */
export function useCapabilities() {
  const { data: session } = useSession();
  const capabilities = (session?.user?.capabilities ??
    roleCapabilityDefaults(session?.user?.role)) as CapabilityKey[];

  return {
    capabilities,
    can: (cap: CapabilityKey) => capabilities.includes(cap),
  };
}
