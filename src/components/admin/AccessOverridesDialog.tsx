"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PAGES, type PageKey } from "@/lib/access/pages";
import { getUserAccess, updateUserAccess } from "@/app/(dashboard)/admin/actions";

export type AccessTarget = {
  id: number;
  name: string | null;
  email: string;
  role: string;
};

type Grants = Partial<Record<PageKey, boolean>>;

const buildGrants = (pages: PageKey[]): Grants => {
  const g: Grants = {};
  for (const p of PAGES) g[p.key] = pages.includes(p.key);
  return g;
};

export function AccessOverridesDialog({
  target,
  onClose,
}: {
  target: AccessTarget | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultPages, setDefaultPages] = useState<PageKey[]>([]);
  const [grants, setGrants] = useState<Grants>({});
  const [initial, setInitial] = useState<Grants>({});

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getUserAccess({ userId: target.id })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setDefaultPages(res.defaultPages);
        const g = buildGrants(res.effectivePages);
        setGrants(g);
        setInitial(g);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [target]);

  const dirty = JSON.stringify(grants) !== JSON.stringify(initial);
  const isDefault = (key: PageKey) =>
    (grants[key] ?? false) === defaultPages.includes(key);

  const toggle = (key: PageKey) =>
    setGrants((g) => ({ ...g, [key]: !g[key] }));

  const applyDefaults = () => setGrants(buildGrants(defaultPages));

  const save = async () => {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      const res = await updateUserAccess({
        userId: target.id,
        pages: grants as Record<string, boolean>,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Access Overrides{target ? ` — ${target.name || target.email}` : ""}
          </DialogTitle>
          <DialogDescription>
            Role: <span className="font-mono">{target?.role}</span> · checked =
            can open the page. A dot marks a difference from the role default.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={applyDefaults}
                className="h-7 text-[11px]"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" /> Apply Role
                Defaults
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {PAGES.map((p) => (
                <label
                  key={p.key}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={grants[p.key] ?? false}
                    onCheckedChange={() => toggle(p.key)}
                  />
                  <span>{p.label}</span>
                  {!isDefault(p.key) && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-amber-500"
                      title="Differs from role default"
                      aria-label="Differs from role default"
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}

        <DialogFooter className="items-center">
          <span className="mr-auto text-[11px] text-muted-foreground">
            {dirty ? "Unsaved changes" : "No unsaved changes"}
          </span>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button onClick={save} disabled={saving || loading || !dirty}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
