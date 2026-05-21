"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { ok: true } | { error: string } | undefined;

export async function authenticate(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    // `redirect: false` so signIn sets the auth cookie but returns normally
    // instead of throwing NEXT_REDIRECT. We do the navigation on the client
    // with a full reload so <SessionProvider> remounts and picks up the new
    // session — its `session` prop is only read at initial render, so a
    // soft (client-side) navigation would leave the sidebar stuck on the
    // pre-login state until the next hard refresh.
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Invalid email or password." };
        default:
          return { error: "Something went wrong. Please try again." };
      }
    }
    return { error: "Something went wrong. Please try again." };
  }
}
