import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Code as CodeIcon,
  History,
  Tag,
  Webhook,
} from "lucide-react";
import {
  getAgentApp,
  getAgentAppVersion,
} from "@/lib/agent-apps/data";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentAppHeader } from "@/features/agent-apps/components/route-header/AgentAppHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";


interface VersionPageProps {
  params: Promise<{ id: string; version: string }>;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default async function AgentAppVersionPage({ params }: VersionPageProps) {
  const { id, version } = await params;
  const versionNumber = Number(version);
  if (!Number.isFinite(versionNumber)) notFound();

  const app = await getAgentApp(id);
  const snapshot = await getAgentAppVersion(app.id, versionNumber);
  if (!snapshot) notFound();

  const isCurrent = snapshot.version_number === app.version;
  const codeLines =
    typeof snapshot.component_code === "string"
      ? snapshot.component_code.split("\n").length
      : 0;

  return (
    <>
      <PageHeader>
        <AgentAppHeader appId={app.id} appName={app.name} active="versions" />
      </PageHeader>

      <div
        className="h-full overflow-y-auto"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <div className="max-w-3xl mx-auto px-4 pb-6 pt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2">
              <Link href={`/agent-apps/${app.id}/versions`}>
                <ArrowLeft className="w-3.5 h-3.5" /> All versions
              </Link>
            </Button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                v{snapshot.version_number}
              </h1>
              {isCurrent && (
                <Badge className="bg-primary text-primary-foreground">
                  current
                </Badge>
              )}
              {snapshot.status && (
                <Badge variant="secondary" className="capitalize">
                  {snapshot.status}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              {formatDateTime(snapshot.changed_at)}
            </div>
            {snapshot.change_note && (
              <p className="text-sm italic text-muted-foreground/90 border-l-2 border-muted-foreground/30 pl-2">
                {snapshot.change_note}
              </p>
            )}
          </div>

          <Separator />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <KV label="Name" value={snapshot.name ?? "—"} />
              <KV label="Tagline" value={snapshot.tagline ?? "—"} />
              <KV
                label="Description"
                value={snapshot.description ?? "—"}
              />
              <KV label="Category" value={snapshot.category ?? "—"} />
              <KV
                label="Tags"
                value={
                  Array.isArray(snapshot.tags) && snapshot.tags.length > 0
                    ? snapshot.tags.join(", ")
                    : "—"
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex-row items-center gap-2">
              <Webhook className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm">Agent binding (snapshot)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <KV label="Agent ID" value={snapshot.agent_id ?? "—"} mono />
              <KV
                label="Agent version"
                value={snapshot.agent_version_id ?? "—"}
                mono
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <CodeIcon className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm">Code</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <KV label="Language" value={snapshot.component_language ?? "—"} />
              <KV
                label="Lines"
                value={codeLines > 0 ? String(codeLines) : "—"}
              />
              {/* Note: viewing the actual code at this version is a follow-up;
                  the editor's history view will be the primary surface. */}
              <p className="text-xs pt-2">
                Viewing this version's code in-editor is coming next. For now
                the snapshot fields above are the read-only record.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function KV({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground/80 font-medium pt-0.5">
        {label}
      </div>
      <div className={mono ? "font-mono text-xs break-words" : "break-words"}>
        {value}
      </div>
    </div>
  );
}
