"use client";

import { marketingRoutes } from "@/features/marketing/lib/routes";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  Globe2,
  Landmark,
  ListTree,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "@/lib/toast";
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
import { useBrand, useCreateSite } from "@/features/marketing/data/hooks";
import { normalizeWebsiteUrl } from "@/features/marketing/lib/website-url";
import { extractErrorMessage } from "@/utils/errors";

export function NewSiteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgs = useActiveOrganizationPicker();
  const create = useCreateSite();
  const [rootUrl, setRootUrl] = useState("");
  const [urlTouched, setUrlTouched] = useState(false);
  const [name, setName] = useState("");
  // What kind of site this is decides where creation LANDS, nothing else:
  // an existing site goes to its cockpit (homepage capture kicks off); a
  // planned one goes straight to the Content Plan Setup view — there is no
  // live site to crawl yet, and both kinds can coexist on one brand.
  const [purpose, setPurpose] = useState<"existing" | "planned">(() =>
    searchParams.get("purpose") === "planned" ? "planned" : "existing",
  );
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  // `?brand=` pre-binds the new site to that brand: the RPC receives the id
  // explicitly (an explicit brand ALWAYS wins over name matching) and the
  // organization is locked to the brand's.
  const targetBrandId = searchParams.get("brand");
  const targetBrand = useBrand(targetBrandId ?? "");
  const selectedOrgId = targetBrand.data
    ? targetBrand.data.organization_id
    : (organizationId ?? orgs.activeOrgId ?? undefined);
  let urlIsValid = false;
  try {
    normalizeWebsiteUrl(rootUrl);
    urlIsValid = true;
  } catch {
    urlIsValid = false;
  }
  const busy = create.isPending;
  const canSubmit = Boolean(
    selectedOrgId &&
      urlIsValid &&
      !busy &&
      !orgs.loading &&
      // With a target brand in the URL, wait until it resolves so the create
      // can never silently fall back to name matching.
      (!targetBrandId || targetBrand.data),
  );

  const normalizeVisibleUrl = () => {
    setUrlTouched(true);
    try {
      setRootUrl(normalizeWebsiteUrl(rootUrl).toString());
    } catch {
      // Keep the user's text in place so they can correct it.
    }
  };

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
        brandId: targetBrand.data?.id,
      });
    } catch (error) {
      toast.error("Could not add site", {
        description: extractErrorMessage(error),
      });
      return;
    }

    if (purpose === "planned") {
      toast.success("Site added — plan it before it exists.");
      router.push(marketingRoutes.contentPlanSite(site.id, "setup"));
      return;
    }
    toast.success("Site added");
    router.push(`${marketingRoutes.site(site.brand_id, site.id)}?capture=homepage`);
  };

  return (
    <>
      <EntityModeHeader
        backHref={
          targetBrandId
            ? marketingRoutes.brand(targetBrandId)
            : marketingRoutes.sites()
        }
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
              {purpose === "existing"
                ? "Add a website you manage. We’ll capture its homepage and then you can crawl it, connect search data, and track improvements."
                : "Register a site that doesn’t exist yet. You’ll land in Content Plan Setup to design its structure — crawl and search data can come later, once it’s live."}
            </p>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
              {(
                [
                  {
                    value: "existing" as const,
                    icon: Globe2,
                    title: "Existing website",
                    body: "It’s live — capture the homepage, then crawl and track it.",
                  },
                  {
                    value: "planned" as const,
                    icon: ListTree,
                    title: "Planned website",
                    body: "It doesn’t exist yet — start from a content plan.",
                  },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={purpose === option.value}
                  onClick={() => setPurpose(option.value)}
                  className={
                    purpose === option.value
                      ? "rounded-md border border-primary bg-primary/5 px-3 py-2 text-left"
                      : "rounded-md border border-border px-3 py-2 text-left hover:bg-muted/40"
                  }
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <option.icon className="h-3.5 w-3.5 text-primary" />
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {option.body}
                  </span>
                </button>
              ))}
            </div>
            {targetBrandId ? (
              <div className="flex items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 sm:col-span-2">
                <Landmark className="h-4 w-4 shrink-0 text-primary" />
                {targetBrand.isLoading ? (
                  <span className="text-xs text-muted-foreground">
                    Resolving brand…
                  </span>
                ) : targetBrand.data ? (
                  <span className="text-xs text-foreground">
                    Adding a website to{" "}
                    <span className="font-semibold">
                      {targetBrand.data.name}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-destructive">
                    The target brand could not be loaded — creation is blocked
                    so the site can't attach to the wrong brand.
                  </span>
                )}
              </div>
            ) : null}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="site-url" className="text-xs">
                {purpose === "existing" ? "Website URL" : "Intended domain"}
              </Label>
              <Input
                id="site-url"
                type="text"
                value={rootUrl}
                onChange={(event) => setRootUrl(event.target.value)}
                onBlur={normalizeVisibleUrl}
                placeholder="example.com"
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
                {purpose === "existing"
                  ? "You can enter just the domain — we’ll add https:// for you."
                  : "The address it will live at once launched — it doesn’t need to resolve yet."}
              </p>
              {urlTouched && !urlIsValid ? (
                <p id="site-url-error" className="text-[11px] text-destructive">
                  Enter a valid website, such as example.com.
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
                disabled={orgs.loading || Boolean(targetBrand.data)}
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
              {orgs.loadFailed ? (
                <p className="text-[11px] text-destructive">
                  We couldn’t load your organizations. Refresh this page or{" "}
                  <Link href="/organizations" className="underline">
                    manage organizations
                  </Link>
                  .
                </p>
              ) : !orgs.loading && orgs.organizations.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  You need an organization before adding a site.{" "}
                  <Link
                    href="/organizations"
                    className="text-primary underline"
                  >
                    Create or join one
                  </Link>
                  .
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              You can share this site with teammates after it’s added.
            </div>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {create.isPending ? "Creating site…" : "Create site"}
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}
