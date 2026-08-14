"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Globe2, Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { CmsSiteService } from "../../services/cmsService";
import type { ClientSite } from "../../types";
import { activeSiteDomain, clientSiteRootUrl } from "../../utils/pageUrls";

const PROVIDERS = {
  godaddy: {
    name: "GoDaddy",
    dashboard: "https://dcc.godaddy.com/control/portfolio",
    help: "https://www.godaddy.com/help/add-a-cname-record-19236",
    steps: ["Open your domain, then choose DNS.", "Add the A or CNAME record shown below.", "Save, return here, and click Check connection."],
  },
  namecheap: {
    name: "Namecheap",
    dashboard: "https://ap.www.namecheap.com/domains/domaincontrolpanel/",
    help: "https://www.namecheap.com/support/knowledgebase/article.aspx/9646/2237/how-to-create-a-cname-record-for-your-domain/",
    steps: ["Open Domain List → Manage → Advanced DNS.", "Choose Add New Record and enter the values below.", "Save all changes, then check the connection here."],
  },
  cloudflare: {
    name: "Cloudflare",
    dashboard: "https://dash.cloudflare.com/",
    help: "https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/",
    steps: ["Choose the domain, then open DNS → Records.", "Add the record below. Set Proxy status to DNS only while connecting.", "Save, then check the connection here."],
  },
  vercel: {
    name: "Vercel DNS",
    dashboard: "https://vercel.com/dashboard",
    help: "https://vercel.com/docs/domains/set-up-custom-domain",
    steps: ["Open the my-matrx project → Settings → Domains and add this domain.", "Use the DNS values Vercel displays; they are authoritative for the project.", "After Vercel shows Valid Configuration, check the connection here."],
  },
  squarespace: {
    name: "Squarespace Domains",
    dashboard: "https://account.squarespace.com/domains",
    help: "https://support.squarespace.com/hc/en-us/articles/360002101888-Adding-custom-DNS-records-to-your-Squarespace-managed-domain",
    steps: ["Open the domain and choose DNS Settings.", "Add the record shown below.", "Save, then return here to check the connection."],
  },
  ionos: {
    name: "IONOS",
    dashboard: "https://my.ionos.com/domains",
    help: "https://www.ionos.com/help/domains/connecting-a-domain-with-an-external-website/connecting-your-domain-to-vercel/",
    steps: ["Open Domains & SSL and select the domain.", "Open DNS and add the value below.", "Save, then check the connection here."],
  },
  route53: {
    name: "AWS Route 53",
    dashboard: "https://console.aws.amazon.com/route53/v2/hostedzones",
    help: "https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-creating.html",
    steps: ["Open the domain's hosted zone and choose Create record.", "Enter the record below and save.", "Return here and check the connection."],
  },
  wix: {
    name: "Wix",
    dashboard: "https://manage.wix.com/account/domains",
    help: "https://support.wix.com/en/article/adding-or-updating-dns-records-in-your-wix-account",
    steps: ["Open Domains, choose the domain, then Advanced → Manage DNS Records.", "Add the record shown below.", "Save and check the connection here."],
  },
} as const;

type ProviderKey = keyof typeof PROVIDERS;

export function SiteDomainSettings({ site, onRefresh }: { site: ClientSite; onRefresh: () => Promise<void> }) {
  const traffic = site.settings?.domain_traffic;
  const activeDomain = activeSiteDomain(site);
  const [checking, setChecking] = useState(false);
  const [provider, setProvider] = useState<ProviderKey>(
    traffic?.provider && traffic.provider in PROVIDERS ? traffic.provider as ProviderKey : "godaddy",
  );
  const platformUrl = clientSiteRootUrl(site.slug);
  const desiredUrl = site.domain ? `https://${site.domain}` : null;
  const usingCustom = Boolean(activeDomain);
  const record = useMemo(() => {
    if (!site.domain) return null;
    const labels = site.domain.split(".");
    const apex = labels.length === 2;
    return apex
      ? { type: "A", name: "@", value: "76.76.21.21" }
      : { type: "CNAME", name: labels.slice(0, -2).join("."), value: "cname.vercel-dns-0.com" };
  }, [site.domain]);

  const check = async () => {
    setChecking(true);
    try {
      const result = await CmsSiteService.verifyDomain(site.id);
      if (result.provider && result.provider in PROVIDERS) setProvider(result.provider as ProviderKey);
      result.verified
        ? toast.success(`${result.domain} is connected. New live links now use it.`)
        : toast.error(result.error || "The domain is not connected yet. Matrx links remain active.");
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not check the domain");
    } finally {
      setChecking(false);
    }
  };

  const usePlatform = async () => {
    await CmsSiteService.routeTrafficToPlatform(site.id);
    await onRefresh();
    toast.success("Generated live links now use the Matrx URL.");
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success("Copied");
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Globe2 className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Domain connection</h3>
            <Badge variant={usingCustom ? "default" : "secondary"}>
              {usingCustom ? "Connected" : "Matrx URL active"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Your site stays reachable on Matrx while DNS is being set up. We switch generated live links only after this domain reaches the correct site over HTTPS.
          </p>
        </div>
        <div className="flex gap-2">
          {usingCustom && <Button size="sm" variant="outline" onClick={usePlatform}>Use Matrx URL instead</Button>}
          <Button size="sm" onClick={check} disabled={!site.domain || checking} className="gap-1.5">
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Check connection
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <a href={platformUrl} target="_blank" rel="noreferrer" className="rounded-md border p-3 hover:border-primary">
          <div className="text-[11px] font-medium text-muted-foreground">Working Matrx URL</div>
          <div className="mt-1 flex items-center gap-1 text-xs text-primary break-all">{platformUrl}<ExternalLink className="h-3 w-3 shrink-0" /></div>
        </a>
        <a href={desiredUrl || undefined} target="_blank" rel="noreferrer" aria-disabled={!desiredUrl} className="rounded-md border p-3 hover:border-primary aria-disabled:pointer-events-none aria-disabled:opacity-50">
          <div className="text-[11px] font-medium text-muted-foreground">Desired custom URL</div>
          <div className="mt-1 flex items-center gap-1 text-xs break-all">{desiredUrl || "Save a domain above first"}{desiredUrl && <ExternalLink className="h-3 w-3 shrink-0" />}</div>
        </a>
      </div>

      {traffic?.last_error && !usingCustom && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <strong>Not connected yet.</strong> {traffic.last_error} All generated traffic is still going to the working Matrx URL.
        </div>
      )}

      {site.domain && record && (
        <div className="space-y-4 border-t pt-4">
          <div>
            <h4 className="text-sm font-medium">Connect {site.domain}</h4>
            <p className="text-xs text-muted-foreground mt-1">First add the domain to the <a className="text-primary underline" href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">my-matrx project in Vercel</a>. Then update DNS where the domain is managed.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PROVIDERS) as ProviderKey[]).map((key) => (
              <Button key={key} size="sm" variant={provider === key ? "default" : "outline"} onClick={() => setProvider(key)} className="h-7 text-xs">
                {PROVIDERS[key].name}
              </Button>
            ))}
          </div>
          <div className="rounded-md border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm">{PROVIDERS[provider].name} instructions</strong>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" asChild><a href={PROVIDERS[provider].help} target="_blank" rel="noreferrer">Official guide <ExternalLink className="ml-1 h-3 w-3" /></a></Button>
                <Button size="sm" asChild><a href={PROVIDERS[provider].dashboard} target="_blank" rel="noreferrer">Open DNS dashboard <ExternalLink className="ml-1 h-3 w-3" /></a></Button>
              </div>
            </div>
            <ol className="list-decimal pl-5 text-xs text-muted-foreground space-y-1">
              {PROVIDERS[provider].steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([['Type', record.type], ['Name / Host', record.name], ['Value', record.value]] as const).map(([label, value]) => (
                <div key={label} className="rounded bg-muted p-2">
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                  <button className="mt-1 flex w-full items-center justify-between gap-2 text-left font-mono text-xs" onClick={() => copy(value)}>{value}<Copy className="h-3 w-3 shrink-0" /></button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Vercel can assign project-specific DNS values. If its Domains screen shows a different value, use Vercel's value.</p>
          </div>
          {usingCustom && <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> HTTPS marker verified for this exact CMS site.</div>}
        </div>
      )}
    </div>
  );
}
