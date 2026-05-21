import NextAuth from "next-auth";
import authConfig from "@/auth.config";

// Uses only the edge-safe config (no DB / bcrypt) so it can run in middleware.
export default NextAuth(authConfig).auth;

export const config = {
  // Run on everything except Auth.js endpoints, Next internals, and static files.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)",
  ],
};
