"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import {
  UserPlus,
  KeyRound,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { themeClasses } from "@/lib/theme-classes";
import {
  createUser,
  updateUserRole,
  setUserActive,
  resetUserPassword,
} from "@/app/(dashboard)/admin/actions";

export type AdminUser = {
  id: number;
  email: string;
  name: string | null;
  role: "admin" | "member" | "system_admin";
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

const ROLE_LABELS: Record<AdminUser["role"], string> = {
  system_admin: "System Admin",
  admin: "Admin",
  member: "Member",
};

const ROLE_VARIANTS: Record<
  AdminUser["role"],
  "default" | "secondary" | "outline"
> = {
  system_admin: "default",
  admin: "secondary",
  member: "outline",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "Just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface UsersTableProps {
  users: AdminUser[];
  currentUserId: number;
}

type Banner =
  | { kind: "error"; text: string }
  | { kind: "warning"; text: string }
  | { kind: "success"; text: string }
  | null;

export function UsersTable({ users, currentUserId }: UsersTableProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const t = themeClasses(dark);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);

  const run = async (
    userId: number | null,
    fn: () => Promise<{ ok: true; warning?: string } | { ok: false; error: string }>,
    successText: string,
  ) => {
    setBusyId(userId);
    setBanner(null);
    try {
      const result = await fn();
      if (!result.ok) setBanner({ kind: "error", text: result.error });
      else if (result.warning) setBanner({ kind: "warning", text: result.warning });
      else setBanner({ kind: "success", text: successText });
      return result;
    } finally {
      setBusyId(null);
    }
  };

  const handleRoleChange = (user: AdminUser, role: AdminUser["role"]) => {
    if (role === user.role) return;
    run(
      user.id,
      () => updateUserRole({ userId: user.id, role }),
      `Role updated to ${ROLE_LABELS[role]}`,
    );
  };

  const handleActiveChange = (user: AdminUser, isActive: boolean) => {
    run(
      user.id,
      () => setUserActive({ userId: user.id, isActive }),
      isActive ? "User activated" : "User deactivated",
    );
  };

  const sectionCard = `rounded-xl border ${t.card}`;
  const thBase = `py-2 px-3 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${t.textSub}`;
  const tdBase = `py-2 px-3 text-[12px] whitespace-nowrap`;
  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";

  return (
    <div className={sectionCard}>
      {/* Toolbar */}
      <div
        className={`p-4 flex items-center justify-between gap-3 border-b ${t.borderLight}`}
      >
        <div>
          <h3 className={`text-sm font-bold ${t.text}`}>Users</h3>
          <p className={`text-[11px] ${t.textMuted} mt-0.5`}>
            {users.length === 1 ? "1 account" : `${users.length} accounts`}
          </p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <UserPlus className="h-4 w-4" />
          New user
        </Button>
      </div>

      {/* Banner */}
      {banner && (
        <div
          role="alert"
          className={`mx-4 mt-3 rounded-md border p-2.5 flex items-center gap-2 text-xs ${
            banner.kind === "error"
              ? dark
                ? "bg-red-900/20 border-red-800 text-red-400"
                : "bg-red-50 border-red-200 text-red-700"
              : banner.kind === "warning"
                ? dark
                  ? "bg-amber-900/20 border-amber-700 text-amber-400"
                  : "bg-amber-50 border-amber-300 text-amber-700"
                : dark
                  ? "bg-emerald-900/20 border-emerald-800 text-emerald-300"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700"
          }`}
        >
          {banner.kind === "error" ? (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : banner.kind === "warning" ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="flex-1">{banner.text}</span>
          <button
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
            className="hover:opacity-70"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-180">
          <thead>
            <tr className={`border-b ${t.borderLight}`}>
              <th className={`${thBase} text-left`}>User</th>
              <th className={`${thBase} text-left`}>Role</th>
              <th className={`${thBase} text-center`}>Active</th>
              <th className={`${thBase} text-left`}>Last login</th>
              <th className={`${thBase} text-left`}>Created</th>
              <th className={`${thBase} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className={`${tdBase} text-center py-8 ${t.textMuted}`}
                >
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const isSelf = user.id === currentUserId;
                const initial = (user.name || user.email)
                  .charAt(0)
                  .toUpperCase();
                const rowBusy = busyId === user.id;
                return (
                  <tr key={user.id} className={`border-b ${rowBorder}`}>
                    <td className={tdBase}>
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${t.avatarBg}`}
                        >
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <div className={`font-semibold ${t.text} truncate`}>
                            {user.name || user.email}
                            {isSelf && (
                              <span
                                className={`ml-2 text-[10px] font-normal ${t.textMuted}`}
                              >
                                (you)
                              </span>
                            )}
                          </div>
                          {user.name && (
                            <div
                              className={`text-[10px] ${t.textMuted} truncate`}
                            >
                              {user.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={tdBase}>
                      {isSelf ? (
                        <Badge variant={ROLE_VARIANTS[user.role]}>
                          {ROLE_LABELS[user.role]}
                        </Badge>
                      ) : (
                        <Select
                          value={user.role}
                          onValueChange={(v) =>
                            handleRoleChange(user, v as AdminUser["role"])
                          }
                          disabled={rowBusy}
                        >
                          <SelectTrigger className="h-7 w-36 text-[11px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="system_admin">
                              System Admin
                            </SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className={`${tdBase} text-center`}>
                      <Switch
                        checked={user.isActive}
                        onCheckedChange={(v) => handleActiveChange(user, v)}
                        disabled={isSelf || rowBusy}
                        aria-label={`${user.isActive ? "Deactivate" : "Activate"} ${user.email}`}
                      />
                    </td>
                    <td className={`${tdBase} ${t.textMuted}`}>
                      {formatRelative(user.lastLoginAt)}
                    </td>
                    <td className={`${tdBase} ${t.textMuted}`}>
                      {formatRelative(user.createdAt)}
                    </td>
                    <td className={`${tdBase} text-right`}>
                      <div className="inline-flex items-center gap-1">
                        {rowBusy && (
                          <Loader2
                            aria-hidden="true"
                            className={`h-3 w-3 animate-spin ${t.textMuted}`}
                          />
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setResetTarget(user)}
                          disabled={rowBusy}
                          className="h-7 text-[11px]"
                        >
                          <KeyRound className="h-3 w-3" />
                          Reset password
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <NewUserDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSubmit={async (values) => {
          const result = await run(
            null,
            () => createUser(values),
            `Created ${values.email}`,
          );
          if (result.ok) setNewOpen(false);
        }}
      />

      <ResetPasswordDialog
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onSubmit={async (password) => {
          if (!resetTarget) return;
          const result = await run(
            resetTarget.id,
            () => resetUserPassword({ userId: resetTarget.id, password }),
            `Password reset for ${resetTarget.email}`,
          );
          if (result.ok) setResetTarget(null);
        }}
      />
    </div>
  );
}

// ---------------- New user dialog ----------------

type NewUserValues = {
  email: string;
  password: string;
  name: string | null;
  role: AdminUser["role"];
};

function NewUserDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (values: NewUserValues) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminUser["role"]>("member");
  const [submitting, setSubmitting] = useState(false);

  // Reset form whenever the dialog opens.
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setEmail("");
      setName("");
      setPassword("");
      setRole("member");
    }
    onOpenChange(v);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        email: email.trim(),
        name: name.trim() || null,
        password,
        role,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>
            Accounts are admin-seeded. Pass the password to the user
            out-of-band; they can sign in immediately.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nu-email">Email</Label>
            <Input
              id="nu-email"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="someone@hogansmith.com"
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nu-name">Name (optional)</Label>
            <Input
              id="nu-name"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nu-password">Password</Label>
            <Input
              id="nu-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nu-role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as AdminUser["role"])}
              disabled={submitting}
            >
              <SelectTrigger id="nu-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system_admin">System Admin</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Reset password dialog ----------------

function ResetPasswordDialog({
  target,
  onClose,
  onSubmit,
}: {
  target: AdminUser | null;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Clear field when the target changes.
  const handleOpenChange = (v: boolean) => {
    if (!v) onClose();
    if (v) setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={target != null} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for{" "}
            <span className="font-semibold">{target?.email}</span>. Share it
            with them out-of-band — they can sign in immediately.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-password">New password</Label>
            <Input
              id="rp-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              disabled={submitting}
              autoFocus
            />
          </div>
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Saving…" : "Set password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
