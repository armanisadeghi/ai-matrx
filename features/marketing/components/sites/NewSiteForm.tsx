"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Camera,
  CheckCircle2,
  Globe2,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";
import { useCreateSite } from "@/features/marketing/data/hooks";
import {
  bootstrapSite,
  type CrawlLiveEvent,
} from "@/features/marketing/crawler/direct-client";
import { extractErrorMessage } from "@/utils/errors";

function normalizeWebsiteUrl(value: string): URL {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Include the full http:// or https:// website URL.");
  }
  const parsed = new URL(trimmed);
  const isHostname =
    parsed.hostname.includes(".") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname) ||
    parsed.hostname.includes(":");
  if (
    !parsed.hostname ||
    !isHostname ||
    !["http:", "https:"].includes(parsed.protocol)
  ) {
    throw new Error("Enter a valid HTTP or HTTPS website URL.");
  }
  parsed.hash = "";
  return parsed;
}

export function NewSiteForm() {
  const router = useRouter();
  const orgs = useActiveOrganizationPicker();
  const create = useCreateSite();
  const [rootUrl, setRootUrl] = useState("");
  const [urlTouched, setUrlTouched] = useState(false);
  const [name, setName] = useState("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [captureStatus, setCaptureStatus] = useState<
    "idle" | "connecting" | "running" | "complete" | "failed"
  >("idle");
  const [captureEvent, setCaptureEvent] = useState<CrawlLiveEvent | null>(null);
  const [captureSessionId, setCaptureSessionId] = useState<string | null>(null);
  const selectedOrgId = organizationId ?? orgs.activeOrgId ?? undefined;
  let urlIsValid = false;
  try {
    normalizeWebsiteUrl(rootUrl);
    urlIsValid = true;
  } catch {
    urlIsValid = false;
  }
  const busy =
    create.isPending || ["connecting", "running"].includes(captureStatus);
  const canSubmit = Boolean(
    selectedOrgId && urlIsValid && !busy && !orgs.loading,
  );

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedOrgId) {
      toast.error("Choose an organization for this site.");
      return;
    }
    let parsed: URL;
    try {
      parsed = normalizeWebsiteUrl(rootUrl);
    } catch (error) {
      toast.error("Could not add site", {
        description: extractErrorMessage(error),
      });
      return;
    }

    let site: Awaited<ReturnType<typeof create.mutateAsync>>;
    try {
      site = await create.mutateAsync({
        organizationId: selectedOrgId,
        name: name.trim() || parsed.hostname,
        rootUrl: parsed.toString(),
        domain: parsed.hostname.toLowerCase(),
      });
    } catch (error) {
      toast.error("Could not add site", {
        description: extractErrorMessage(error),
      });
      return;
    }

    toast.success("Site added", {
      description: "Capturing the homepage directly with the scraper.",
    });
    setCaptureStatus("connecting");
    try {
      const result = await bootstrapSite(site.id, {
        onConnected: ({ sessionId }) => {
          setCaptureSessionId(sessionId);
          setCaptureStatus("running");
        },
        onEvent: (_streamEvent, crawlEvent) => {
          if (crawlEvent) setCaptureEvent(crawlEvent);
        },
      });
      setCaptureSessionId(result.sessionId);
      setCaptureStatus("complete");
      toast.success("Homepage captured");
    } catch (error) {
      setCaptureStatus("failed");
      toast.warning("Site added, but homepage capture needs a retry", {
        description: extractErrorMessage(error),
      });
    }
    router.push(`/marketing/sites/${site.id}`);
  };

  return (
    <>
      <EntityModeHeader
        backHref="/marketing/sites"
        entityLabel="Add site"
        actions={[
          {
            label: "Create site",
            icon: Plus,
            primary: true,
            disabled: !canSubmit,
            onPress: () => {
              const form = document.getElementById("new-marketing-site-form");
              if (form instanceof HTMLFormElement) form.requestSubmit();
            },
          },
        ]}
      />
      <main className="h-full overflow-y-auto bg-textured px-4 pb-8 pt-[calc(var(--shell-header-h)+1rem)]">
        <form
          id="new-marketing-site-form"
          onSubmit={submit}
          className="mx-auto max-w-2xl rounded-lg border border-border bg-card"
        >
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-primary" />
              <h1 className="text-sm font-semibold text-foreground">
                Add a managed website
              </h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              This creates the stable site identity first. Crawls will add
              observations and reconcile discovered URLs into its independent
              page registry.
            </p>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="site-url" className="text-xs">
                Website URL
              </Label>
              <Input
                id="site-url"
                type="url"
                value={rootUrl}
                onChange={(event) => setRootUrl(event.target.value)}
                onBlur={() => setUrlTouched(true)}
                placeholder="https://example.com"
                inputMode="url"
                autoComplete="url"
                aria-invalid={urlTouched && !urlIsValid}
                aria-describedby="site-url-help site-url-error"
                required
              />
              <p
                id="site-url-help"
                className="text-[11px] text-muted-foreground"
              >
                Use the canonical homepage URL, including any required
                subdomain.
              </p>
              {urlTouched && !urlIsValid ? (
                <p id="site-url-error" className="text-[11px] text-destructive">
                  Enter a complete public website URL beginning with http:// or
                  https://.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-name" className="text-xs">
                Display name
              </Label>
              <Input
                id="site-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Defaults to the domain"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Owning organization</Label>
              <Select
                value={selectedOrgId}
                onValueChange={setOrganizationId}
                disabled={orgs.loading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      orgs.loading
                        ? "Loading organizations…"
                        : "Choose organization"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {orgs.organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                      {org.is_personal ? " (Personal)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {captureStatus !== "idle" ? (
            <div className="border-t border-border bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2">
                {captureStatus === "complete" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : ["connecting", "running"].includes(captureStatus) ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Camera className="h-4 w-4 text-destructive" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium">
                    {captureStatus === "connecting"
                      ? "Connecting directly to scraper…"
                      : captureStatus === "running"
                        ? "Capturing homepage…"
                        : captureStatus === "complete"
                          ? "Homepage capture complete"
                          : "Homepage capture did not complete"}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {captureEvent?.event_type ??
                      captureSessionId ??
                      "Preparing session"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              Access to every page, crawl, snapshot, and finding derives from
              this site.
            </div>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {captureStatus === "connecting" || captureStatus === "running"
                ? "Capturing homepage"
                : "Create site"}
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}
