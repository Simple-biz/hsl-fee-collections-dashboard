"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  UserPlus,
  KeyRound,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { AccessOverridesDialog } from "./AccessOverridesDialog";
import { EditUserDialog } from "./EditUserDialog";
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
  role: "admin" | "lead" | "member" | "system_admin";
  isActive: boolean;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
};

const ROLE_LABELS: Record<AdminUser["role"], string> = {
  system_admin: "System Admin",
  admin: "Admin",
  lead: "Lead",
  member: "Member",
};

const ROLE_VARIANTS: Record<
  AdminUser["role"],
  "default" | "secondary" | "outline"
> = {
  system_admin: "default",
  admin: "secondary",
  lead: "secondary",
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
  const [accessTarget, setAccessTarget] = useState<AdminUser | null>(null);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);

  const run = async (
    userId: number | null,
    fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
    successText: string,
  ) => {
    setBusyId(userId);
    setBanner(null);
    try {
      const result = await fn();
      if (!result.ok) setBanner({ kind: "error", text: result.error });
      else setBanner({ kind: "success", text: successText });
      return result;
    } finally {
      setBusyId(null);
    }
  };

  // Applies role + active changes from the Edit modal (only the fields that
  // actually changed), then closes on success.
  const handleEditSubmit = async (
    user: AdminUser,
    role: AdminUser["role"],
    isActive: boolean,
  ) => {
    let ok = true;
    if (role !== user.role) {
      const r = await run(
        user.id,
        () => updateUserRole({ userId: user.id, role }),
        `Role updated to ${ROLE_LABELS[role]}`,
      );
      ok = r.ok;
    }
    if (ok && isActive !== user.isActive) {
      const r = await run(
        user.id,
        () => setUserActive({ userId: user.id, isActive }),
        isActive ? "User activated" : "User deactivated",
      );
      ok = r.ok;
    }
    if (ok) setEditTarget(null);
  };

  const sectionCard = `rounded-xl border ${t.card}`;
  const thBase = `py-2 px-3 text-[12px] font-semibold uppercase tracking-wider whitespace-nowrap ${t.textSub}`;
  const tdBase = `py-2 px-3 text-[14px] whitespace-nowrap`;
  const rowBorder = dark ? "border-neutral-800/50" : "border-neutral-100";

  return (
    <div className={sectionCard}>
      {/* Toolbar */}
      <div
        className={`p-4 flex items-center justify-between gap-3 border-b ${t.borderLight}`}
      >
        <div>
          <h3 className={`text-sm font-bold ${t.text}`}>Users</h3>
          <p className={`text-[13px] ${t.textMuted} mt-0.5`}>
            {users.length === 1 ? "1 account" : `${users.length} accounts`}
          </p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          New user
        </Button>
      </div>

      {/* Banner */}
      {banner && (
        <div
          role={banner.kind === "error" ? "alert" : "status"}
          className={`mx-4 mt-3 rounded-md border p-2.5 flex items-center gap-2 text-xs ${
            banner.kind === "error"
              ? dark
                ? "bg-red-900/20 border-red-800 text-red-400"
                : "bg-red-50 border-red-200 text-red-700"
              : dark
                ? "bg-emerald-900/20 border-emerald-800 text-emerald-300"
                : "bg-emerald-50 border-emerald-200 text-emerald-700"
          }`}
        >
          {banner.kind === "error" ? (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="flex-1">{banner.text}</span>
          <button
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
            className="hover:opacity-70"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-180 select-text">
          <thead>
            <tr className={`border-b ${t.borderLight}`}>
              <th className={`${thBase} text-left`}>User</th>
              <th className={`${thBase} text-left`}>Role</th>
              <th className={`${thBase} text-center`}>Active</th>
              <th className={`${thBase} text-left`}>Last login</th>
              <th className={`${thBase} text-left`}>Last activity</th>
              <th className={`${thBase} text-left`}>Created</th>
              <th className={`${thBase} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
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
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold ${t.avatarBg}`}
                        >
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <div className={`font-semibold ${t.text} truncate`}>
                            {user.name || user.email}
                            {isSelf && (
                              <span
                                className={`ml-2 text-[12px] font-normal ${t.textMuted}`}
                              >
                                (you)
                              </span>
                            )}
                          </div>
                          {user.name && (
                            <a
                              href={`mailto:${user.email}`}
                              className={`text-[12px] ${t.textMuted} truncate hover:underline`}
                            >
                              {user.email}
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={tdBase}>
                      <Badge variant={ROLE_VARIANTS[user.role]}>
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </td>
                    <td className={`${tdBase} text-center`}>
                      <Badge variant={user.isActive ? "secondary" : "outline"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className={`${tdBase} ${t.textMuted}`}>
                      {formatRelative(user.lastLoginAt)}
                    </td>
                    <td className={`${tdBase} ${t.textMuted}`}>
                      {formatRelative(user.lastActivityAt)}
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
                        {!isSelf && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditTarget(user)}
                            disabled={rowBusy}
                            className="h-7 text-[13px]"
                          >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                            Edit
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setResetTarget(user)}
                          disabled={rowBusy}
                          className="h-7 text-[13px]"
                        >
                          <KeyRound className="h-3 w-3" aria-hidden="true" />
                          Reset password
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAccessTarget(user)}
                          disabled={rowBusy}
                          className="h-7 text-[13px]"
                        >
                          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                          Access
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


      <EditUserDialog
        target={editTarget}
        isSelf={editTarget?.id === currentUserId}
        onClose={() => setEditTarget(null)}
        onSubmit={(role, isActive) =>
          editTarget
            ? handleEditSubmit(editTarget, role, isActive)
            : Promise.resolve()
        }
      />

      <AccessOverridesDialog
        target={accessTarget}
        onClose={() => setAccessTarget(null)}
      />

      <ResetPasswordDialog
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onSubmit={async (password, mustChangePassword) => {
          if (!resetTarget) return;
          const result = await run(
            resetTarget.id,
            () => resetUserPassword({ userId: resetTarget.id, password, mustChangePassword }),
            `Password reset for ${resetTarget.email}`,
          );
          if (result.ok) setResetTarget(null);
        }}
      />
    </div>
  );
}

// ---------------- New user dialog ----------------

const CHARSET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%";
const generatePassword = (): string => {
  const limit = 256 - (256 % CHARSET.length);
  const result: string[] = [];
  while (result.length < 12) {
    const buf = new Uint8Array(24);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < limit && result.length < 12) result.push(CHARSET[b % CHARSET.length]);
    }
  }
  return result.join("");
};

type NewUserValues = {
  email: string;
  password: string;
  name: string | null;
  role: AdminUser["role"];
  mustChangePassword: boolean;
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
  const [password, setPassword] = useState(() => generatePassword());
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [role, setRole] = useState<AdminUser["role"]>("member");
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // `open` is set externally (the "New user" button calls onOpenChange
  // directly), so this dialog never unmounts — reset on the `open` prop
  // itself rather than a Dialog onOpenChange callback, which only fires for
  // interactions inside the dialog (Escape, overlay click), not this one.
  useEffect(() => {
    if (open) {
      setEmail("");
      setName("");
      setPassword(generatePassword());
      setShowPassword(false);
      setCopied(false);
      setRole("member");
      setMustChangePassword(true);
    }
  }, [open]);

  const handleCopy = () => {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ email: email.trim(), name: name.trim() || null, password, role, mustChangePassword });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>
            A temporary password is generated automatically. Copy it and share
            with the user out-of-band before closing this dialog.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nu-name">Full name (optional)</Label>
            <Input
              id="nu-name"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nu-email">Email</Label>
            <Input
              id="nu-email"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@hogansmith.com"
              disabled={submitting}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nu-password">Password</Label>
            <div className="flex gap-1.5">
              <Input
                id="nu-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                readOnly
                value={password}
                className="flex-1 font-mono"
                disabled={submitting}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={submitting}
              >
                {showPassword
                  ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                  : <Eye className="h-4 w-4" aria-hidden="true" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => { setPassword(generatePassword()); setCopied(false); }}
                aria-label="Regenerate password"
                disabled={submitting}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
                aria-label="Copy password"
                disabled={submitting}
              >
                {copied
                  ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  : <Copy className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
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
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <Checkbox
              id="nu-force-pw"
              checked={mustChangePassword}
              onCheckedChange={(v) => setMustChangePassword(v === true)}
              disabled={submitting}
            />
            <Label htmlFor="nu-force-pw" className="font-normal cursor-pointer">
              Require password change on first login
            </Label>
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
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
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
  onSubmit: (password: string, mustChangePassword: boolean) => Promise<void>;
}) {
  const [password, setPassword] = useState(() => generatePassword());
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // `target` is set externally via a row action, not through Dialog's own
  // onOpenChange — reset on `target` itself so switching straight from one
  // user's reset dialog to another's doesn't carry over the old password.
  useEffect(() => {
    if (target) {
      setPassword(generatePassword());
      setShowPassword(false);
      setCopied(false);
      setMustChangePassword(true);
    }
  }, [target]);

  const handleCopy = () => {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(password, mustChangePassword);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={target != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            A new temporary password has been generated for{" "}
            <a href={`mailto:${target?.email}`} className="font-semibold hover:underline">{target?.email}</a>. Copy it and
            share out-of-band before closing.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-password">New password</Label>
            <div className="flex gap-1.5">
              <Input
                id="rp-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                readOnly
                value={password}
                className="flex-1 font-mono"
                disabled={submitting}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={submitting}
              >
                {showPassword
                  ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                  : <Eye className="h-4 w-4" aria-hidden="true" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => { setPassword(generatePassword()); setCopied(false); }}
                aria-label="Regenerate password"
                disabled={submitting}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
                aria-label="Copy password"
                disabled={submitting}
              >
                {copied
                  ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  : <Copy className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <Checkbox
              id="rp-force-pw"
              checked={mustChangePassword}
              onCheckedChange={(v) => setMustChangePassword(v === true)}
              disabled={submitting}
            />
            <Label htmlFor="rp-force-pw" className="font-normal cursor-pointer">
              Require password change on first login
            </Label>
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
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {submitting ? "Saving…" : "Set password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
