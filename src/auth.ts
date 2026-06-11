import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { resolveEffectivePages } from "@/lib/access/server";
import { rolePageDefaults } from "@/lib/access/role-defaults";
import authConfig from "@/auth.config";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Credentials provider requires JWT sessions (no DB session table).
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase().trim();
        const { password } = parsed.data;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        // Same null response whether the user is missing, disabled, or the
        // password is wrong — don't leak which accounts exist.
        if (!user || !user.isActive) return null;

        const passwordMatches = await bcrypt.compare(
          password,
          user.passwordHash,
        );
        if (!passwordMatches) return null;

        // Best-effort last-login stamp; never block sign-in on this.
        try {
          await db
            .update(users)
            .set({ lastLoginAt: new Date() })
            .where(eq(users.id, user.id));
        } catch {
          /* non-critical */
        }

        // Resolve effective page access (role default ⊕ overrides) once at
        // sign-in and bake it into the token so the edge gate needs no DB.
        // On any failure (e.g. overrides table missing), degrade to the role
        // DEFAULTS — never to an empty set, which would lock the user out.
        const pages = await resolveEffectivePages(user.id, user.role).catch(
          () => rolePageDefaults(user.role),
        );

        return {
          // NextAuth expects a string id; users.id is an integer.
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
          pages,
        };
      },
    }),
  ],
});
