"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type EditUserTarget = {
  id: number;
  email: string;
  name: string | null;
  role: "admin" | "lead" | "member" | "system_admin";
  isActive: boolean;
};

export function EditUserDialog({
  target,
  isSelf,
  onClose,
  onSubmit,
}: {
  target: EditUserTarget | null;
  isSelf: boolean;
  onClose: () => void;
  onSubmit: (
    role: EditUserTarget["role"],
    isActive: boolean,
  ) => Promise<void>;
}) {
  const [role, setRole] = useState<EditUserTarget["role"]>("member");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) {
      setRole(target.role);
      setIsActive(target.isActive);
    }
  }, [target]);

  const dirty =
    !!target && (role !== target.role || isActive !== target.isActive);

  const save = async () => {
    setSaving(true);
    try {
      await onSubmit(role, isActive);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit user{target ? ` — ${target.name || target.email}` : ""}
          </DialogTitle>
          <DialogDescription>
            Change this user&apos;s role and active status.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as EditUserTarget["role"])}
              disabled={isSelf || saving}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system_admin">System Admin</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
            {isSelf && (
              <p className="text-[11px] text-muted-foreground">
                You can&apos;t change your own role or active status.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="edit-user-active">Active</Label>
            <Switch
              id="edit-user-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={isSelf || saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !dirty}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
