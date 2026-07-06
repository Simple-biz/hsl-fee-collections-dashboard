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
import { CAPABILITIES, type CapabilityKey } from "@/lib/access/capabilities";
import { getUserAccess, updateUserAccess } from "@/app/(dashboard)/admin/actions";

export type AccessTarget = {
  id: number;
  name: string | null;
  email: string;
  role: string;
};

type Grants = Partial<Record<PageKey, boolean>>;
type CapGrants = Partial<Record<CapabilityKey, boolean>>;

const buildGrants = (pages: PageKey[]): Grants => {
  const g: Grants = {};
  for (const p of PAGES) g[p.key] = pages.includes(p.key);
  return g;
};

const buildCapGrants = (caps: CapabilityKey[]): CapGrants => {
  const g: CapGrants = {};
  for (const c of CAPABILITIES) g[c.key] = caps.includes(c.key);
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
  const [defaultCaps, setDefaultCaps] = useState<CapabilityKey[]>([]);
  const [capGrants, setCapGrants] = useState<CapGrants>({});
  const [capInitial, setCapInitial] = useState<CapGrants>({});

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
        setDefaultCaps(res.defaultCapabilities);
        const cg = buildCapGrants(res.effectiveCapabilities);
        setCapGrants(cg);
        setCapInitial(cg);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [target]);

  const dirty =
    JSON.stringify(grants) !== JSON.stringify(initial) ||
    JSON.stringify(capGrants) !== JSON.stringify(capInitial);
  const isDefault = (key: PageKey) =>
    (grants[key] ?? false) === defaultPages.includes(key);
  const isCapDefault = (key: CapabilityKey) =>
    (capGrants[key] ?? false) === defaultCaps.includes(key);

  const toggle = (key: PageKey) =>
    setGrants((g) => ({ ...g, [key]: !g[key] }));
  const toggleCap = (key: CapabilityKey) =>
    setCapGrants((g) => ({ ...g, [key]: !g[key] }));

  const applyDefaults = () => {
    setGrants(buildGrants(defaultPages));
    setCapGrants(buildCapGrants(defaultCaps));
  };

  const save = async () => {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      const res = await updateUserAccess({
        userId: target.id,
        pages: grants as Record<string, boolean>,
        capabilities: capGrants as Record<string, boolean>,
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
            allowed. A dot marks a difference from the role default. Changes take
            effect on the user&apos;s next sign-in.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={applyDefaults}
                className="h-7 text-[13px]"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" /> Apply Role
                Defaults
              </Button>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pages
              </p>
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

            <div>
              <p className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                Case actions
              </p>
              <div className="grid grid-cols-1 gap-x-6 gap-y-2">
                {CAPABILITIES.map((c) => (
                  <label
                    key={c.key}
                    className="flex items-start gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={capGrants[c.key] ?? false}
                      onCheckedChange={() => toggleCap(c.key)}
                    />
                    <span className="flex flex-col">
                      <span className="flex items-center gap-1.5">
                        {c.label}
                        {!isCapDefault(c.key) && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-amber-500"
                            title="Differs from role default"
                            aria-label="Differs from role default"
                          />
                        )}
                      </span>
                      <span className="text-[13px] text-muted-foreground">
                        {c.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}

        <DialogFooter className="items-center">
          <span className="mr-auto text-[13px] text-muted-foreground">
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
