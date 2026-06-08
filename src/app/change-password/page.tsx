import type { Metadata } from "next";
import { DollarSign } from "lucide-react";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = {
  title: "Set new password · SSA Fee Collections",
};

export default function ChangePasswordPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-900">
            <DollarSign className="h-5 w-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-neutral-900">
              Fee Collections
            </h1>
            <p className="text-xs text-neutral-500">Hogan Smith Law</p>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="px-6 pt-6 pb-4">
            <p className="text-base font-semibold text-neutral-900">Set a new password</p>
            <p className="text-sm text-neutral-500 mt-1">
              Your account requires a password change before you can continue.
            </p>
          </div>
          <div className="px-6 pb-6">
            <ChangePasswordForm />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-400">
          Access is restricted to authorized staff. Contact an administrator if
          you need an account.
        </p>
      </div>
    </main>
  );
}
