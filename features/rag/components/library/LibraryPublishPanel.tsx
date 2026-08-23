"use client";

/**
 * LibraryPublishPanel — publish ANY Matrx Library resource to an audience
 * (Shared Knowledge Resources): a data store, an SEO starter pack, … The axis
 * is AUDIENCE (industry / organization / everyone) and the ONE write path is
 * `public.library_publish` / `public.library_revoke` over
 * `platform.entity_grants` (any-admin gate + per-type rule in the DB — a
 * pack must be ratified before an industry or global audience; an
 * organization audience is the PILOT lane and accepts a proposed pack).
 * Render behind the admin gate.
 *
 * Organization audience: pass `organizationOptions` when the caller has a
 * platform-wide org directory (the Shared Knowledge console loads it
 * server-side). Without the prop the panel falls back to the caller's own
 * organizations (`getUserOrganizations`) — the only org list a client sees
 * under RLS.
 *
 * Replaced `DataStorePublishPanel` (2026-08-22).
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe, Building2, Layers, Loader2, X, Library } from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import {
  useLibraryGrants,
  type LibraryEntityType,
} from "@/features/rag/hooks/useLibraryGrants";
import { useIndustries } from "@/features/industries/hooks";
import { getUserOrganizations } from "@/features/organizations/service";

export interface PublishOrganizationOption {
  id: string;
  name: string;
}

interface LibraryPublishPanelProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: LibraryEntityType;
  entityId: string;
  entityName: string;
  /** What recipients can do with it — one sentence, resource-specific. */
  recipientHint?: string;
  organizationOptions?: PublishOrganizationOption[];
  /** Notify the caller after a successful publish/revoke (refresh lists). */
  onChanged?: () => void;
}

export function LibraryPublishPanel({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName,
  recipientHint,
  organizationOptions,
  onChanged,
}: LibraryPublishPanelProps) {
  const { grants, loading, error, publish, revoke } = useLibraryGrants(
    entityType,
    isOpen ? entityId : null,
  );
  const { industries, refresh: refreshIndustries } = useIndustries();
  const [industryId, setIndustryId] = useState<string>("");
  const [organizationId, setOrganizationId] = useState<string>("");
  const [fallbackOrgs, setFallbackOrgs] = useState<PublishOrganizationOption[]>([]);
  const [busy, setBusy] = useState(false);

  const orgOptions = organizationOptions ?? fallbackOrgs;

  // The panel can stay mounted across taxonomy edits — refetch the industry
  // list every time it opens so a just-created industry is publishable.
  useEffect(() => {
    if (isOpen) refreshIndustries();
  }, [isOpen, refreshIndustries]);

  useEffect(() => {
    if (!isOpen || organizationOptions) return;
    let cancelled = false;
    getUserOrganizations()
      .then((orgs) => {
        if (!cancelled) setFallbackOrgs(orgs.map((o) => ({ id: o.id, name: o.name })));
      })
      .catch((e) => {
        console.error("[LibraryPublishPanel] could not load orgs:", e);
        if (!cancelled) toast.error("Could not load organizations");
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, organizationOptions]);

  const run = async (
    args: Parameters<typeof publish>[0],
    okMessage: string,
    reset?: () => void,
  ) => {
    setBusy(true);
    const ok = await publish(args);
    setBusy(false);
    if (ok) {
      toast.success(okMessage);
      reset?.();
      onChanged?.();
    } else {
      toast.error(error ?? "Could not publish");
    }
  };

  const onRevoke = async (id: string) => {
    const ok = await revoke(id);
    if (ok) {
      toast.success("Access revoked");
      onChanged?.();
    } else toast.error(extractErrorMessage(error) || "Could not revoke");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-4 w-4 text-primary" />
            Publish “{entityName}”
          </DialogTitle>
          <DialogDescription>
            {recipientHint ??
              "Make this library resource available to an audience. Recipients can use it — they cannot edit, delete, or re-publish it."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Published to</div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : grants.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              Not published yet — private to the library.
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {grants.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2 text-foreground">
                    {g.audience === "global" ? (
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : g.audience === "industry" ? (
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {g.audience === "global"
                      ? "Everyone"
                      : g.audience === "industry"
                        ? (g.industryName ?? "Industry")
                        : (g.organizationName ?? "Organization")}
                    {g.audience === "organization" && entityType === "seo_starter_pack" ? (
                      <span className="text-[11px] text-muted-foreground">· subscribed / pilot</span>
                    ) : null}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRevoke(g.id)}
                    className="h-7 px-2 text-muted-foreground hover:text-destructive"
                    aria-label="Revoke access"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Tabs defaultValue="industry" className="mt-1">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="industry">
              <Layers className="mr-1.5 h-3.5 w-3.5" /> Industry
            </TabsTrigger>
            <TabsTrigger value="organization">
              <Building2 className="mr-1.5 h-3.5 w-3.5" /> Organization
            </TabsTrigger>
            <TabsTrigger value="global">
              <Globe className="mr-1.5 h-3.5 w-3.5" /> Everyone
            </TabsTrigger>
          </TabsList>

          <TabsContent value="industry" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Every organization that has opted into the chosen industry gets it automatically.
            </p>
            <Select value={industryId} onValueChange={setIndustryId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an industry…" />
              </SelectTrigger>
              <SelectContent>
                {industries.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                    <span className="text-muted-foreground"> · {i.facet.replace("_", " ")}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() =>
                run({ audience: "industry", industryId }, "Published to industry", () =>
                  setIndustryId(""),
                )
              }
              disabled={!industryId || busy}
              className="w-full"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Publish to industry
            </Button>
          </TabsContent>

          <TabsContent value="organization" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              One specific organization — no industry membership required.
              {entityType === "seo_starter_pack"
                ? " This is how a proposed pack is piloted with one customer before ratification."
                : ""}
            </p>
            <Select value={organizationId} onValueChange={setOrganizationId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an organization…" />
              </SelectTrigger>
              <SelectContent>
                {orgOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() =>
                run(
                  { audience: "organization", organizationId },
                  "Published to organization",
                  () => setOrganizationId(""),
                )
              }
              disabled={!organizationId || busy}
              className="w-full"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Publish to organization
            </Button>
          </TabsContent>

          <TabsContent value="global" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Every organization on the platform. Use only for truly universal resources.
            </p>
            <Button
              onClick={() => run({ audience: "global" }, "Published to everyone")}
              disabled={busy}
              variant="secondary"
              className="w-full"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Publish to everyone
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
