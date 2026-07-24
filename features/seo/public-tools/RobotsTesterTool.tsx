"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { postNdjson } from "@/lib/python-client";
import { getFingerprint } from "@/lib/services/fingerprint-service";

interface RobotsPathCheck {
  path: string;
  user_agent: string;
  allowed: boolean;
}

interface RobotsCheckResult {
  site_url: string;
  robots_url: string;
  found: boolean;
  status_code: number;
  raw_robots_txt: string;
  sitemaps: string[];
  checks: RobotsPathCheck[];
}

const STAGE_LABELS: Record<string, string> = {
  "seo.budget_check_passed": "Checked usage limits",
  "seo.fetch_started": "Fetching robots.txt",
  "seo.fetch_completed": "robots.txt fetched",
  "seo.parse_completed": "Parsed rules",
};

export function RobotsTesterTool() {
  const [url, setUrl] = useState("");
  const [path, setPath] = useState("/");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RobotsCheckResult | null>(null);

  const run = useCallback(async () => {
    const target = url.trim();
    if (!target || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setStage("Connecting");
    try {
      const fingerprint = await getFingerprint();
      const paths = path.trim() ? [path.trim()] : ["/"];
      for await (const evt of postNdjson(
        "/seo/public/robots-check",
        { url: target, paths, user_agents: ["*", "Googlebot"] },
        { guestFingerprint: fingerprint },
      )) {
        if (evt.event === "error") {
          setError(evt.data.user_message ?? evt.data.message);
          continue;
        }
        if (evt.event !== "data") continue;
        const data = evt.data as unknown as Record<string, unknown>;
        const kind = typeof data.kind === "string" ? data.kind : null;
        if (!kind) continue;
        if (kind === "seo.robots_check_result") {
          const final = data.result as RobotsCheckResult | undefined;
          if (final) setResult(final);
          continue;
        }
        setStage(STAGE_LABELS[kind] ?? kind);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      setStage(null);
    }
  }, [url, path, running]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="rounded-2xl border-border">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              onKeyDown={(e) => e.key === "Enter" && run()}
              className="flex-1"
              disabled={running}
            />
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/path-to-test"
              onKeyDown={(e) => e.key === "Enter" && run()}
              className="sm:w-56"
              disabled={running}
            />
            <Button onClick={run} disabled={running || !url.trim()} className="sm:w-40">
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking
                </>
              ) : (
                <>
                  <ShieldAlert className="mr-2 h-4 w-4" /> Check robots.txt
                </>
              )}
            </Button>
          </div>
          {running && stage ? (
            <p className="text-xs text-muted-foreground">{stage}…</p>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={result.found ? "default" : "outline"}>
              {result.found ? "robots.txt found" : "No robots.txt (everything allowed)"}
            </Badge>
            {result.sitemaps.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {result.sitemaps.length} sitemap(s) declared
              </span>
            ) : null}
          </div>

          <Card className="rounded-2xl border-border">
            <CardContent className="space-y-2 p-5">
              {result.checks.map((check, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {check.allowed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span className="font-mono text-xs text-foreground">{check.path}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {check.user_agent}
                  </Badge>
                  <span
                    className={cn(
                      "text-xs",
                      check.allowed ? "text-success" : "text-destructive",
                    )}
                  >
                    {check.allowed ? "Allowed" : "Disallowed"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {result.sitemaps.length > 0 ? (
            <Card className="rounded-2xl border-border">
              <CardContent className="space-y-1 p-5">
                <div className="text-xs font-medium text-foreground">Sitemaps</div>
                {result.sitemaps.map((sm) => (
                  <div key={sm} className="font-mono text-xs text-muted-foreground">
                    {sm}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {result.found && result.raw_robots_txt ? (
            <Card className="rounded-2xl border-border">
              <CardContent className="p-5">
                <div className="mb-2 text-xs font-medium text-foreground">Raw robots.txt</div>
                <pre className="max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                  {result.raw_robots_txt}
                </pre>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
