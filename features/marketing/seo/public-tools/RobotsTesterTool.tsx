"use client";

import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Share2,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useShare } from "@/features/sharing/hooks/useShare";
import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";
import { cn } from "@/lib/utils";
import type { components } from "@/types/python-generated/api-types";

type RobotsCheckResult = components["schemas"]["RobotsCheckResult"];
type RobotsPathCheck = components["schemas"]["RobotsPathCheck"];
type Present<T, K extends keyof T> = T & Required<Pick<T, K>>;
type ValidatedRobotsPathCheck = Present<
  RobotsPathCheck,
  "matched_rule" | "matched_rule_line"
>;
type ValidatedRobotsCheckResult = Omit<
  Present<
    RobotsCheckResult,
    "raw_robots_txt" | "sitemaps" | "syntax_errors" | "truncated" | "checks"
  >,
  "checks"
> & { checks: ValidatedRobotsPathCheck[] };

const TOOL_URL = "https://www.aimatrx.com/seo/robots-tester";

const CRAWLERS = [
  { value: "Googlebot", label: "Googlebot" },
  { value: "Bingbot", label: "Bingbot" },
  { value: "GPTBot", label: "GPTBot" },
  { value: "ClaudeBot", label: "ClaudeBot" },
  { value: "*", label: "Default rules (*)" },
] as const;

const STAGE_LABELS: Record<string, string> = {
  "seo.budget_check_passed": "Checked usage limits",
  "seo.fetch_started": "Fetching robots.txt",
  "seo.fetch_completed": "robots.txt fetched",
  "seo.parse_completed": "Parsed rules",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPathCheck(value: unknown): value is ValidatedRobotsPathCheck {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.user_agent === "string" &&
    typeof value.allowed === "boolean" &&
    typeof value.explanation === "string" &&
    (value.matched_rule === null || typeof value.matched_rule === "string") &&
    (value.matched_rule_line === null ||
      typeof value.matched_rule_line === "number")
  );
}

function isRobotsCheckResult(
  value: unknown,
): value is ValidatedRobotsCheckResult {
  return (
    isRecord(value) &&
    value.result_kind === "public.robots_check" &&
    typeof value.site_url === "string" &&
    typeof value.robots_url === "string" &&
    typeof value.fetched_url === "string" &&
    typeof value.found === "boolean" &&
    typeof value.status_code === "number" &&
    typeof value.raw_robots_txt === "string" &&
    typeof value.truncated === "boolean" &&
    Array.isArray(value.sitemaps) &&
    value.sitemaps.every((item) => typeof item === "string") &&
    Array.isArray(value.syntax_errors) &&
    value.syntax_errors.every((item) => typeof item === "string") &&
    Array.isArray(value.checks) &&
    value.checks.length > 0 &&
    value.checks.every(isPathCheck)
  );
}

function testTarget(input: string): { siteUrl: string; path: string } {
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Enter a public http or https page URL.");
  }
  return {
    siteUrl: parsed.origin,
    path: `${parsed.pathname || "/"}${parsed.search}`,
  };
}

export function RobotsTesterTool() {
  const { share, copied, fallbackDialog } = useShare();
  const [url, setUrl] = useState("");
  const [crawler, setCrawler] = useState("Googlebot");
  // Durable — see `useSeoCommandRun`: the check's `seo.collection_run` row is
  // claimed server-side before the fetch, so a reload rejoins it by id.
  const command = useSeoCommandRun<ValidatedRobotsCheckResult>({
    key: "robots-tester",
    path: "/seo/public/robots-check",
    finalKind: "seo.robots_check_result",
    stageLabels: STAGE_LABELS,
    parseResult: (raw) => (isRobotsCheckResult(raw) ? raw : null),
  });
  const { running, stage, error, result, rejoinedTarget, status } = command;

  function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = url.trim();
    if (!input || running) return;

    let target: { siteUrl: string; path: string };
    try {
      target = testTarget(input);
    } catch (targetError) {
      command.fail(
        targetError instanceof Error
          ? targetError.message
          : "Enter a valid page URL.",
      );
      return;
    }

    void command.launch(
      {
        url: target.siteUrl,
        paths: [target.path],
        user_agents: [crawler],
        force_refresh: true,
      },
      input,
    );
  }

  const primaryCheck = result?.checks[0];
  const matchedLines = new Set<number>();
  if (result) {
    for (const check of result.checks) {
      if (typeof check.matched_rule_line === "number") {
        matchedLines.add(check.matched_rule_line);
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="rounded-2xl border-border">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <form
            onSubmit={run}
            className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]"
          >
            <div className="space-y-2">
              <Label htmlFor="robots-page-url">Page URL to test</Label>
              <Input
                id="robots-page-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/private/page"
                autoComplete="url"
                disabled={running}
              />
              <p className="text-xs text-muted-foreground">
                Paste the exact page. We find its robots.txt and test that page
                path.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="robots-crawler">Crawler</Label>
              <Select
                value={crawler}
                onValueChange={setCrawler}
                disabled={running}
              >
                <SelectTrigger id="robots-crawler">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRAWLERS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start gap-2 sm:pt-6">
              <Button type="submit" disabled={running || !url.trim()}>
                {running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking
                  </>
                ) : (
                  <>
                    <ShieldAlert className="mr-2 h-4 w-4" /> Test URL
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Share this robots.txt tester"
                title={copied ? "Link copied" : "Share this tool"}
                onClick={() =>
                  share({
                    title: "Free Robots.txt Tester — AI Matrx",
                    text: "Check whether a crawler can access any page and see the exact robots.txt rule.",
                    url: TOOL_URL,
                  })
                }
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>

          <div aria-live="polite">
            {running && stage ? (
              <p className="text-xs text-muted-foreground">
                {status === "rejoining" && rejoinedTarget
                  ? `Still testing ${rejoinedTarget} — ${stage}…`
                  : `${stage}…`}
              </p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        </CardContent>
      </Card>

      {result && primaryCheck ? (
        <div className="space-y-4">
          <Card
            className={cn(
              "rounded-2xl border-2",
              primaryCheck.allowed
                ? "border-success/40 bg-success/5"
                : "border-destructive/40 bg-destructive/5",
            )}
          >
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                {primaryCheck.allowed ? (
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-destructive" />
                )}
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-foreground">
                    {primaryCheck.user_agent} is{" "}
                    {primaryCheck.allowed ? "allowed" : "blocked"}
                  </h2>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {primaryCheck.path}
                  </p>
                  <p className="mt-2 text-sm text-foreground">
                    {primaryCheck.explanation}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={result.found ? "default" : "outline"}>
                  {result.found ? "robots.txt found" : "No robots.txt found"}
                </Badge>
                <span>HTTP {result.status_code}</span>
                {result.content_type ? (
                  <span>{result.content_type}</span>
                ) : null}
                <a
                  href={result.fetched_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  Open robots.txt <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardContent>
          </Card>

          {result.syntax_errors.length > 0 ? (
            <Card className="rounded-2xl border-warning/40 bg-warning/5">
              <CardContent className="space-y-2 p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Syntax warnings
                </h2>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {result.syntax_errors.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {result.sitemaps.length > 0 ? (
            <Card className="rounded-2xl border-border">
              <CardContent className="space-y-2 p-5">
                <h2 className="text-sm font-semibold text-foreground">
                  Declared sitemap{result.sitemaps.length === 1 ? "" : "s"}
                </h2>
                {result.sitemaps.map((sitemap) => (
                  <a
                    key={sitemap}
                    href={sitemap}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 break-all font-mono text-xs text-primary hover:underline"
                  >
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {sitemap}
                  </a>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {result.found && result.raw_robots_txt ? (
            <Card className="rounded-2xl border-border">
              <CardContent className="p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    robots.txt source
                  </h2>
                  {result.truncated ? (
                    <Badge variant="outline">Preview truncated</Badge>
                  ) : null}
                </div>
                <ol className="max-h-80 overflow-auto rounded-lg border border-border bg-muted/40 py-2 font-mono text-xs">
                  {result.raw_robots_txt.split("\n").map((line, index) => {
                    const lineNumber = index + 1;
                    return (
                      <li
                        key={`${lineNumber}-${line}`}
                        className={cn(
                          "grid grid-cols-[3rem_1fr] px-3 py-0.5",
                          matchedLines.has(lineNumber) &&
                            "bg-primary/15 text-foreground",
                        )}
                      >
                        <span className="select-none text-right text-muted-foreground">
                          {lineNumber}
                        </span>
                        <span className="ml-4 whitespace-pre-wrap break-all">
                          {line || " "}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {fallbackDialog}
    </div>
  );
}
