"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import Link from "next/link";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationIds } from "@/features/scopes/redux/selectors/tree";
import { ErrorNotice } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchVaultItems } from "@/features/secrets/vault-service";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  connectionErrorMessage,
  connectedSchema,
  domainConfig,
  domainProviders,
  inventorySchema,
  listDomainConnections,
  providerLabels,
  reportSchema,
  requiredFields,
  saveDomainConfig,
  siteConnectionOperation,
} from "./service";

export function DomainConnections() {
  const { site } = useMarketingSite();
  const queryClient = useQueryClient();
  const userId = useAppSelector(selectUserId);
  const organizationIds = useAppSelector(selectOrganizationIds);
  const config = domainConfig(site);
  const [provider, setProvider] =
    useState<(typeof domainProviders)[number]>("cloudflare");
  const [credentialId, setCredentialId] = useState("");
  const [manual, setManual] = useState(config.manual_domains.join(", "));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState<unknown>(null);
  const [report, setReport] = useState<z.infer<typeof reportSchema> | null>(
    () => {
      const metadata = z
        .object({ owned_domain_check: reportSchema.optional() })
        .passthrough()
        .parse(site.metadata);
      return metadata.owned_domain_check ?? null;
    },
  );
  const accounts = useQuery({
    queryKey: ["domainConnections", userId],
    queryFn: listDomainConnections,
    enabled: Boolean(userId),
    select: (rows) =>
      rows.filter((row) =>
        row.owner_user_id !== null
          ? row.owner_user_id === userId
          : row.owner_type === "organization" &&
            row.organization_id !== null &&
            organizationIds.includes(row.organization_id),
      ),
  });
  const vault = useQuery({
    queryKey: ["domainVaultCredentials"],
    queryFn: async () => {
      const groups = await Promise.all([
        fetchVaultItems({ kind: "mine" }),
        fetchVaultItems({ kind: "shared" }),
        fetchVaultItems({ kind: "organization", organizationId: null }),
      ]);
      return [
        ...new Map(groups.flat().map((item) => [item.id, item])).values(),
      ];
    },
  });
  const eligible =
    vault.data?.filter(
      (item) =>
        item.capabilities.can_use &&
        item.status === "active" &&
        ![
          "website_login",
          "credential_login",
          "oauth_token_set",
          "remote_mcp_oauth",
          "native_passkey",
        ].includes(item.definition_key) &&
        (!item.provider_key || item.provider_key === provider) &&
        requiredFields[provider].every((key) =>
          item.fields.some(
            (field) => field.field_key === key && field.is_active,
          ),
        ),
    ) ?? [];
  async function execute(work: () => Promise<void>) {
    setBusy(true);
    setFailure(null);
    setMessage("Checking domain evidence…");
    try {
      await work();
      await queryClient.invalidateQueries({
        queryKey: marketingKeys.site(site.id),
      });
      await accounts.refetch();
    } catch (error) {
      setFailure(error);
      setMessage("");
    } finally {
      await accounts.refetch();
      await queryClient.invalidateQueries({
        queryKey: marketingKeys.site(site.id),
      });
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Owned domains</CardTitle>
      </CardHeader>
      <CardContent gap="md">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={provider}
            onValueChange={(value) => {
              setProvider(z.enum(domainProviders).parse(value));
              setCredentialId("");
            }}
          >
            <SelectTrigger width="md" aria-label="Domain provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {domainProviders.map((key) => (
                <SelectItem key={key} value={key}>
                  {providerLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={credentialId} onValueChange={setCredentialId}>
            <SelectTrigger width="lg" aria-label="Vault API credential">
              <SelectValue placeholder="Vault API credential" />
            </SelectTrigger>
            <SelectContent>
              {eligible.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={busy || !credentialId}
            onClick={() =>
              void execute(async () => {
                const result = await siteConnectionOperation(
                  site,
                  "domain-connections/connect",
                  {
                    provider,
                    credential_item_id: credentialId,
                    account_name:
                      eligible.find((item) => item.id === credentialId)
                        ?.display_name ?? providerLabels[provider],
                  },
                  connectedSchema,
                  setMessage,
                );
                try {
                  await saveDomainConfig(site, {
                    ...config,
                    connection_ids: [
                      ...new Set([...config.connection_ids, result.id]),
                    ],
                  });
                } catch {
                  setMessage(
                    "Account connected. Attach it below after refreshing this site.",
                  );
                  return;
                }
                setMessage(
                  `${providerLabels[provider]} connected · ${result.inventory.domains.length} domains found`,
                );
              })
            }
          >
            Connect
          </Button>
          <Button variant="outline" asChild>
            <Link href="/vault">Open Vault</Link>
          </Button>
        </div>
        <p className="type-body text-muted-foreground">
          API credential fields: {requiredFields[provider].join(", ")}
        </p>
        {vault.error || accounts.error ? (
          <ErrorNotice
            error={vault.error ?? accounts.error}
            operation="Read domain connections"
            size="compact"
          />
        ) : null}
        {accounts.data?.map((account) => {
          const inventory = z
            .object({ domain_inventory: inventorySchema.optional() })
            .passthrough()
            .parse(account.metadata).domain_inventory;
          const attached = config.connection_ids.includes(account.id);
          return (
            <div key={account.id} className="space-y-2 border-t pt-3">
              <div className="flex gap-2 items-center">
                <Checkbox
                  aria-label={`Use ${account.account_name ?? account.provider} for this site`}
                  checked={attached}
                  disabled={busy}
                  onCheckedChange={(checked) =>
                    void execute(async () => {
                      await saveDomainConfig(site, {
                        ...config,
                        connection_ids: checked
                          ? [...config.connection_ids, account.id]
                          : config.connection_ids.filter(
                              (id) => id !== account.id,
                            ),
                      });
                      setMessage(
                        checked
                          ? "Account attached"
                          : "Account detached; observations retained",
                      );
                    })
                  }
                />
                <span>
                  {account.account_name ?? account.provider} · {account.status}
                </span>
                <Button
                  variant="outline"
                  disabled={busy || !attached}
                  onClick={() =>
                    void execute(async () => {
                      const refreshed = await siteConnectionOperation(
                        site,
                        "domain-connections/refresh",
                        { connection_id: account.id },
                        inventorySchema,
                        setMessage,
                      );
                      setMessage(
                        refreshed.complete
                          ? "Inventory refreshed"
                          : "Partial inventory; previous observations retained",
                      );
                    })
                  }
                >
                  Refresh domains
                </Button>
              </div>
              {inventory?.warnings.map((warning) => (
                <p key={warning} role="status" className="type-body">
                  {warning}
                </p>
              ))}
              {inventory?.domains.map((row) => (
                <div key={row.domain} className="flex items-start gap-2">
                  <Checkbox
                    aria-label={`Check ${row.domain}`}
                    checked={config.selected_domains.includes(row.domain)}
                    disabled={busy || !attached}
                    onCheckedChange={(checked) =>
                      void execute(async () => {
                        await saveDomainConfig(site, {
                          ...config,
                          selected_domains: checked
                            ? [
                                ...new Set([
                                  ...config.selected_domains,
                                  row.domain,
                                ]),
                              ]
                            : config.selected_domains.filter(
                                (domain) => domain !== row.domain,
                              ),
                        });
                        setMessage("Domain selection saved");
                      })
                    }
                  />
                  <div className="type-body">
                    <p>{row.domain}</p>
                    {row.sources.map((source) => (
                      <p
                        key={source.resource_ref}
                        className="text-muted-foreground break-all"
                      >
                        {providerLabels[inventory.provider]} · {source.basis} ·{" "}
                        {source.state} ·{" "}
                        {new Date(source.observed_at).toLocaleString()}
                        {source.dns_records.length
                          ? ` · ${source.dns_records.map((record) => `${record.type} ${record.name} → ${record.value}`).join("; ")}`
                          : ""}
                        {!source.details_complete
                          ? " · DNS details incomplete"
                          : ""}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        <div className="flex gap-2">
          <Input
            aria-label="Manually entered domains"
            placeholder="example.com, other-example.com"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
          />
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void execute(async () => {
                await saveDomainConfig(site, {
                  ...config,
                  manual_domains: manual.split(/[\s,]+/).filter(Boolean),
                });
                setMessage("Manual domains saved");
              })
            }
          >
            Save domains
          </Button>
        </div>
        <Button
          disabled={busy}
          onClick={() =>
            void execute(async () => {
              const result = await siteConnectionOperation(
                site,
                "domain-connections/check",
                {},
                reportSchema,
                setMessage,
              );
              setReport(result);
              setMessage(`Redirect check: ${result.status}`);
            })
          }
        >
          Check redirects
        </Button>
        {failure ? (
          <ErrorNotice
            error={failure}
            message={connectionErrorMessage(failure)}
            operation="Manage owned domains"
            records={[{ type: "web_site", id: site.id }]}
            size="compact"
          />
        ) : null}
        {message ? (
          <p role="status" className="type-body">
            {message}
          </p>
        ) : null}
        {report ? (
          <div className="space-y-2">
            <p className="type-body">
              {report.canonical} ·{" "}
              {new Date(report.observed_at).toLocaleString()}
            </p>
            {report.variants.map((variant) => (
              <div key={variant.url} className="type-body border-t pt-2">
                <p>
                  {variant.url} · {variant.outcome} · {variant.reason}
                </p>
                {variant.duplicate ? (
                  <p className="font-medium">
                    Measured duplicate content ·{" "}
                    {Math.round((variant.similarity ?? 0) * 100)}% match
                  </p>
                ) : null}
                <p className="text-muted-foreground break-all">
                  {variant.hops
                    .map((hop) => `${hop.status} ${hop.url}`)
                    .join(" → ")}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
