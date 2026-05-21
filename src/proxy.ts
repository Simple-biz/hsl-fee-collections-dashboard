import NextAuth from "next-auth";
import authConfig from "@/auth.config";

// Auth gate, runs at the edge/proxy layer. Uses only the edge-safe config
// (no DB / bcrypt). Renamed from middleware.ts per Next.js 16's proxy convention.
export const proxy = NextAuth(authConfig).auth;

export const config = {
  // Run on everything except Auth.js endpoints, Next internals, and static files.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)",
  ],
};
