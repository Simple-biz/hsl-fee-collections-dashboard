import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration.
 *
 * This file is imported by `middleware.ts`, which runs in the Edge runtime, so
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

      if (isOnLogin) {
        // Already authenticated users shouldn't see the login page.
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }

      return isLoggedIn;
    },
    // Persist id/role onto the JWT at sign-in.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    // Expose id/role on the session for client and server consumers.
    session({ session, token }) {
      if (session.user) {
        if (token.id) session.user.id = token.id;
        if (token.role) session.user.role = token.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
