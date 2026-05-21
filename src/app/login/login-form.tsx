"use client";

import { useActionState, useEffect } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { authenticate } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );

  // Full reload after a successful sign-in so SessionProvider remounts and
  // picks up the new session cookie. (Its `session` prop is captured at
  // initial render only — a soft navigation would leave the sidebar stuck
  // on the pre-login state.)
  const ok = state && "ok" in state && state.ok;
  useEffect(() => {
    if (ok) window.location.assign("/");
  }, [ok]);

  const redirecting = Boolean(ok);
  const disabled = isPending || redirecting;
  const error = state && "error" in state ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@hogansmith.com"
          required
          autoFocus
          disabled={disabled}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          disabled={disabled}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <Button type="submit" className="mt-2 w-full" disabled={disabled}>
        {disabled && <Loader2 className="h-4 w-4 animate-spin" />}
        {redirecting ? "Redirecting…" : isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
