import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Code as CodeIcon,
  History,
  Tag,
} from "lucide-react";
import { getApplet, getAppletVersion } from "@/lib/applets/data";
import { AppletHeader } from "@/features/applets/components/route-header/AppletHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { VersionCodeCompare } from "./VersionCodeCompare";
import { appletFiles, appletJobs, appletPages, appletSources } from "@/features/applets/types";
import { VersionRecordCopy } from "./VersionRecordCopy";
import { formatDateTime } from "@/features/applets/format";

interface VersionPageProps {
  params: Promise<{ id: string; version: string }>;
}

export default async function AppletVersionPage({
  params,
}: VersionPageProps) {
  const { id, version } = await params;
  const versionNumber = Number(version);
  if (!Number.isFinite(versionNumber)) notFound();

  const app = await getApplet(id);
  const snapshot = await getAppletVersion(app.id, versionNumber);
  if (!snapshot) notFound();

  const isCurrent = snapshot.version_number === app.content_version;
  const snapshotFiles = appletFiles(snapshot);
  const currentFiles = appletFiles(app);
  const fileNames = [...new Set([...Object.keys(snapshotFiles), ...Object.keys(currentFiles)])].sort();
  const jobs = appletJobs(snapshot);
  const sources = appletSources(snapshot);
  const pages = appletPages(snapshot);

  return (
    <>
      <AppletHeader
        appId={app.id}
        appName={app.name}
        initialStatus={app.status}
        initialPublishedToWeb={app.published_to_web}
        active="versions"
      />

      <div
        className="h-full overflow-y-auto"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <div className="px-4 sm:px-6 pb-6 pt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Button asChild variant="quiet" className="-ml-2">
              <Link href={`/applets/manage/${app.id}/versions`}>
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
              <VersionRecordCopy
                appId={app.id}
                appName={app.name}
                snapshot={snapshot}
                isCurrent={isCurrent}
              />
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <KV label="Name" value={snapshot.name ?? "—"} />
                <KV label="Tagline" value={snapshot.tagline ?? "—"} />
                <KV label="Description" value={snapshot.description ?? "—"} />
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
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Pages, jobs and sources</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <KV label="Entry" value={snapshot.entry ?? "—"} mono />
                <KV
                  label="Pages"
                  value={pages.length ? pages.map((p) => `${p.path} → ${p.file}`).join(", ") : "—"}
                  mono
                />
                <KV
                  label="Jobs"
                  value={jobs.length ? jobs.map((j) => `${j.alias} → ${j.key}`).join(", ") : "—"}
                  mono
                />
                <KV
                  label="Sources"
                  value={
                    sources.length
                      ? sources.map((s) => ("entity" in s ? `${s.alias} → ${s.entity}` : `${s.alias} → table`)).join(", ")
                      : "—"
                  }
                  mono
                />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2 flex-row items-center gap-2">
                <CodeIcon className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm">Files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {fileNames.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No files.</p>
                ) : (
                  fileNames.map((name) => {
                    const then = snapshotFiles[name];
                    const now = currentFiles[name];
                    const state =
                      then === undefined ? "not in this version" : now === undefined ? "removed since" : then === now ? "same as current" : "changed since";
                    return (
                      <div key={name} className="flex items-center justify-between gap-3">
                        <span className="font-mono text-xs">{name}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          {state}
                          {!isCurrent && then !== undefined && now !== undefined && then !== now && (
                            <VersionCodeCompare
                              snapshotCode={then}
                              currentCode={now}
                              language="typescript"
                              snapshotVersion={snapshot.version_number}
                            />
                          )}
                        </span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
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
