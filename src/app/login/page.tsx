import type { Metadata } from "next";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { LoginForm } from "./login-form";
import { TestAccountsHint } from "./test-accounts-hint";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SHOW_TEST_LOGINS = process.env.NEXT_PUBLIC_SHOW_TEST_LOGINS === "true";

export const metadata: Metadata = {
  title: "Sign in · SSA Fee Collections",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const { changed } = await searchParams;

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-linear-to-b from-neutral-50 to-neutral-100 px-4 dark:from-neutral-950 dark:to-neutral-900">
      {/* Soft decorative glow behind the card. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-neutral-300/40 blur-3xl dark:bg-neutral-700/30"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="relative h-16 w-56">
            <Image
              src="/HSL_Logo.png"
              alt="Hogan Smith Law"
              fill
              priority
              sizes="224px"
              className="object-contain"
            />
          </div>
          <h1 className="text-sm font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
            Fee Collections
          </h1>
        </div>

        {changed === "1" && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Password updated — please sign in with your new password.
          </div>
        )}

        <Card className="shadow-xl shadow-black/5 dark:shadow-black/30">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Enter your credentials to access the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-neutral-400 dark:text-neutral-500">
          Access is restricted to authorized staff. Contact an administrator if
          you need an account.
        </p>

        {SHOW_TEST_LOGINS && (
          <div className="mt-3 flex justify-center">
            <TestAccountsHint />
          </div>
        )}
      </div>
    </main>
  );
}
