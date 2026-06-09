import type { DefaultSession } from "next-auth";

type UserRole = "admin" | "member" | "system_admin";

declare module "next-auth" {
  /** Returned by `authorize` and stored on the session user. */
  interface User {
    role?: UserRole;
    mustChangePassword?: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      mustChangePassword: boolean;
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
  }
}
