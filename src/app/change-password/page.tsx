import type { Metadata } from "next";
import { DollarSign } from "lucide-react";
import { ChangePasswordForm } from "./change-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Set new password · SSA Fee Collections",
};

export default function ChangePasswordPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-900">
            <DollarSign className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-neutral-900">
              Fee Collections
            </h1>
            <p className="text-xs text-neutral-500">Hogan Smith Law</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Set a new password</CardTitle>
            <CardDescription>
              Your account requires a password change before you can continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
