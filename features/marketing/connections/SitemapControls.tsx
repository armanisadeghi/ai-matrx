"use client";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { MarketingSite } from "@/features/marketing/types";
import { sitemapSchema, siteConnectionOperation } from "./service";

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
  const [removing, setRemoving] = useState<string | null>(null);
  async function operate(
    action: "list" | "submit" | "delete",
    sitemapUrl = "",
  ) {
    setBusy(true);
    setMessage("Checking Search Console…");
    try {
      const result = await siteConnectionOperation(
        site,
        "search-console/sitemaps",
        { action, sitemap_url: sitemapUrl },
        sitemapSchema,
        setMessage,
      );
      setReceipt(result);
      setMessage(
        result.message ??
          (result.state === "listed" ? "Sitemaps refreshed" : result.state),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Search Console unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sitemaps</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void operate("list")}
        >
          Refresh sitemaps
        </Button>
        {receipt ? (
          <p className="text-sm break-all">
            {receipt.property} · Connection {receipt.connection_id}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="text-sm">
            {message}
          </p>
        ) : null}
        {receipt?.write_reason ? (
          <p className="text-sm text-muted-foreground">
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
            disabled={busy || !receipt?.write_available || !url.trim()}
            onClick={() => void operate("submit", url.trim())}
          >
            Submit
          </Button>
        </div>
        {receipt?.sitemaps.length === 0 && receipt.state === "listed" ? (
          <p className="text-sm text-muted-foreground">No submitted sitemaps</p>
        ) : null}
        {receipt?.sitemaps.map((sitemap) => (
          <div
            key={sitemap.path}
            className="flex items-center justify-between gap-3 border-t pt-2"
          >
            <div className="min-w-0 text-sm">
              <p className="break-all">{sitemap.path}</p>
              <p className="text-muted-foreground">
                {sitemap.isPending
                  ? "Pending processing"
                  : "Processing complete"}{" "}
                · Errors {sitemap.errors ?? "unknown"} · Last fetched{" "}
                {sitemap.lastDownloaded ?? "not fetched"}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={busy || !receipt.write_available}
              onClick={() => setRemoving(sitemap.path)}
            >
              Remove
            </Button>
          </div>
        ))}
        <AlertDialog
          open={removing !== null}
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Remove sitemap from Search Console?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {removing} will be removed from the selected property. The
                sitemap file and indexed pages remain unchanged.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (removing) void operate("delete", removing);
                  setRemoving(null);
                }}
              >
                Remove sitemap
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
