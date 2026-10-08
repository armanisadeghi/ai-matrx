"use client";
import { useState } from "react";
import { z } from "zod";
import { ErrorNotice } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import type { MarketingSite } from "@/features/marketing/types";
import {
  sitemapSchema,
  siteConnectionOperation,
  connectionErrorMessage,
} from "./service";

export function SitemapControls({
  site,
}: {
  site: Pick<MarketingSite, "id" | "organization_id">;
}) {
  const [receipt, setReceipt] = useState<z.infer<typeof sitemapSchema> | null>(
    null,
  );
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState<unknown>(null);
  const [uncertain, setUncertain] = useState(false);
  const isError =
    Boolean(failure) ||
    receipt?.state === "rejected" ||
    receipt?.state === "unknown";
  async function operate(
    action: "list" | "submit" | "delete",
    sitemapUrl = "",
  ) {
    setBusy(true);
    setFailure(null);
    setMessage("Checking Search Console…");
    try {
      const result = await siteConnectionOperation(
        site,
        "search-console/sitemaps",
        { action, sitemap_url: sitemapUrl, operation_id: crypto.randomUUID() },
        sitemapSchema,
        setMessage,
      );
      setReceipt(result);
      setUncertain(result.state === "unknown");
      setMessage(
        result.message ??
          (result.state === "listed" ? "Sitemaps refreshed" : result.state),
      );
    } catch (error) {
      if (action !== "list") setUncertain(true);
      setFailure(error);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sitemaps</CardTitle>
      </CardHeader>
      <CardContent gap="md">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void operate("list")}
        >
          Refresh sitemaps
        </Button>
        {receipt ? (
          <p className="type-body break-all">
            {receipt.property} ·{" "}
            {receipt.account_name ?? "Connected Google account"}
          </p>
        ) : null}
        {isError ? (
          <ErrorNotice
            error={failure ?? receipt}
            message={
              failure ? connectionErrorMessage(failure) : receipt?.message
            }
            operation="Manage Search Console sitemaps"
            records={[{ type: "web_site", id: site.id }]}
            size="compact"
          />
        ) : null}
        {message ? (
          <p role="status" className="type-body">
            {message}
          </p>
        ) : null}
        {receipt?.write_reason ? (
          <p className="type-body text-muted-foreground">
            {receipt.write_reason}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Input
            aria-label="Sitemap URL"
            placeholder="https://example.com/sitemap.xml"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button
            disabled={
              busy || uncertain || !receipt?.write_available || !url.trim()
            }
            onClick={() => void operate("submit", url.trim())}
          >
            Submit
          </Button>
        </div>
        {!isError &&
        receipt?.sitemaps.length === 0 &&
        receipt.state === "listed" ? (
          <p className="type-body text-muted-foreground">No submitted sitemaps</p>
        ) : null}
        {receipt?.sitemaps.map((sitemap) => (
          <div
            key={sitemap.path}
            className="flex items-center justify-between gap-3 border-t pt-2"
          >
            <div className="min-w-0 type-body">
              <p className="break-all">{sitemap.path}</p>
              <p className="text-muted-foreground">
                {sitemap.isPending
                  ? "Pending processing"
                  : sitemap.isPending === false
                    ? "Processing complete"
                    : "Processing status unavailable"}{" "}
                · Errors {sitemap.errors ?? "unknown"} · Last fetched{" "}
                {sitemap.lastDownloaded ?? "not fetched"}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={busy || uncertain || !receipt.write_available}
              onClick={async () => {
                if (
                  await confirm({
                    title: "Remove sitemap?",
                    description: `${sitemap.path} will be removed from Search Console.`,
                    variant: "destructive",
                    confirmLabel: "Remove",
                    cancelLabel: "Cancel",
                  })
                )
                  void operate("delete", sitemap.path);
              }}
            >
              Remove
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
