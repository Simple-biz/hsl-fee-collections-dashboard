import type { DefaultSession } from "next-auth";
import type { PageKey } from "@/lib/access/pages";

type UserRole = "admin" | "lead" | "member" | "system_admin";

declare module "next-auth" {
  /** Returned by `authorize` and stored on the session user. */
  interface User {
    role?: UserRole;
    mustChangePassword?: boolean;
    /** Effective page-access set, resolved at sign-in. */
    pages?: PageKey[];
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      mustChangePassword: boolean;
      pages: PageKey[];
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
  }
}
