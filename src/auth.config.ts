import type { NextAuthConfig } from "next-auth";
import { pageKeyForPath } from "@/lib/access/pages";

/**
 * Edge-safe Auth.js configuration.
 *
 * This file is imported by `proxy.ts`, which runs in the Edge runtime, so
 * it MUST NOT import the database client, bcrypt, or any Node-only modules.
 * The Credentials provider (which needs those) is added in `auth.ts`.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  // Providers are added in auth.ts (kept out of the edge bundle).
  providers: [],
  callbacks: {
    // Gate every route. Returning `false` redirects to the `signIn` page.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname === "/login";
      const isOnChangePassword = nextUrl.pathname === "/change-password";
      const mustChange = auth?.user?.mustChangePassword ?? false;

      if (isOnLogin) {
        if (isLoggedIn) {
          const dest = mustChange ? "/change-password" : "/";
          return Response.redirect(new URL(dest, nextUrl));
        }
        return true;
      }

      if (isOnChangePassword) {
        return isLoggedIn;
      }

      if (isLoggedIn && mustChange) {
        return Response.redirect(new URL("/change-password", nextUrl));
      }

      if (!isLoggedIn) return false;

      // Page-access gate. `pages` is the effective set baked into the token at
      // sign-in. Only enforce for recognized page paths (null = api/asset/etc.,
      // left to their own auth). Overview is never gated so the redirect target
      // can't loop. Tokens minted before this feature have no `pages` array —
      // skip the gate for them so existing sessions aren't locked out until
      // their next login.
      const pageKey = pageKeyForPath(nextUrl.pathname);
      const pages = auth?.user?.pages;
      if (
        pageKey &&
        pageKey !== "overview" &&
        Array.isArray(pages) &&
        pages.length > 0 &&
        !pages.includes(pageKey)
      ) {
        return Response.redirect(new URL("/", nextUrl));
      }

      return true;
    },
    // Persist id/role/mustChangePassword onto the JWT at sign-in.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword ?? false;
        token.pages = user.pages ?? [];
        token.capabilities = user.capabilities ?? [];
      }
      return token;
    },
    // Expose id/role/mustChangePassword on the session for client and server consumers.
    session({ session, token }) {
      if (session.user) {
        if (token.id) session.user.id = token.id;
        if (token.role) session.user.role = token.role;
        session.user.mustChangePassword = token.mustChangePassword ?? false;
        session.user.pages = token.pages ?? [];
        session.user.capabilities = token.capabilities ?? [];
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
