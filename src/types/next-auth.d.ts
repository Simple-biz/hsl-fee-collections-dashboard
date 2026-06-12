import type { DefaultSession } from "next-auth";
import type { PageKey } from "@/lib/access/pages";
import type { CapabilityKey } from "@/lib/access/capabilities";

type UserRole = "admin" | "lead" | "member" | "system_admin";

declare module "next-auth" {
  /** Returned by `authorize` and stored on the session user. */
  interface User {
    role?: UserRole;
    mustChangePassword?: boolean;
    /** Effective page-access set, resolved at sign-in. */
    pages?: PageKey[];
    /** Effective capability set, resolved at sign-in. */
    capabilities?: CapabilityKey[];
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      mustChangePassword: boolean;
      pages: PageKey[];
      capabilities: CapabilityKey[];
    } & DefaultSession["user"];
  }
}

// The JWT interface is declared in @auth/core/jwt; next-auth/jwt only
// re-exports it, so augmentation must target the original module.
declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    mustChangePassword?: boolean;
    pages?: PageKey[];
    capabilities?: CapabilityKey[];
  }
}
