"use client";

/**
 * DataStorePublishPanel — publish a Matrx Library data store to an audience
 * (Shared Knowledge Resources). Mirrors the ShareModal Dialog/Tabs structure,
 * but the axis is AUDIENCE (industry / everyone), not user/org/public, and it
 * writes via the grant RPCs over HTTP (super-admin gated server-side) rather
 * than the `permissions` table. Super-admin only; render behind selectIsSuperAdmin.
 */

import { useState } from "react";
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
import { toast } from "sonner";
import { useDataStoreGrants } from "@/features/rag/hooks/useDataStoreGrants";
import { useIndustries } from "@/features/industries/hooks";

interface DataStorePublishPanelProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  storeName: string;
}

export function DataStorePublishPanel({
  isOpen,
  onClose,
  storeId,
  storeName,
}: DataStorePublishPanelProps) {
  const { grants, loading, publish, revoke } = useDataStoreGrants(
    isOpen ? storeId : null,
  );
  const { industries } = useIndustries();
  const [industryId, setIndustryId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const onPublishGlobal = async () => {
    setBusy(true);
    const ok = await publish({ audience: "global" });
    setBusy(false);
    if (ok) toast.success("Published to everyone");
    else toast.error("Could not publish");
  };

  const onPublishIndustry = async () => {
    if (!industryId) return;
    setBusy(true);
    const ok = await publish({ audience: "industry", industryId });
    setBusy(false);
    if (ok) {
      toast.success("Published to industry");
      setIndustryId("");
    } else {
      toast.error("Could not publish");
    }
  };

  const onRevoke = async (id: string) => {
    const ok = await revoke(id);
    if (ok) toast.success("Access revoked");
    else toast.error("Could not revoke");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-4 w-4 text-primary" />
            Publish “{storeName}”
          </DialogTitle>
          <DialogDescription>
            Make this library resource readable by an audience. Recipients can
            search and read it — they cannot edit, delete, or re-ingest it.
          </DialogDescription>
        </DialogHeader>

        {/* Current grants */}
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            Published to
          </div>
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
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="industry">
              <Layers className="mr-1.5 h-3.5 w-3.5" /> Industry
            </TabsTrigger>
            <TabsTrigger value="global">
              <Globe className="mr-1.5 h-3.5 w-3.5" /> Everyone
            </TabsTrigger>
          </TabsList>

          <TabsContent value="industry" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Every organization in the chosen industry gets read access
              automatically.
            </p>
            <Select value={industryId} onValueChange={setIndustryId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an industry…" />
              </SelectTrigger>
              <SelectContent>
                {industries.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                    <span className="text-muted-foreground">
                      {" "}
                      · {i.facet.replace("_", " ")}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={onPublishIndustry}
              disabled={!industryId || busy}
              className="w-full"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Publish to industry
            </Button>
          </TabsContent>

          <TabsContent value="global" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Every organization on the platform gets read access. Use only for
              truly universal references.
            </p>
            <Button
              onClick={onPublishGlobal}
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
