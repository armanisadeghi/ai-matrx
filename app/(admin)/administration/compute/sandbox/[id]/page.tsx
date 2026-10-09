"use client";

// app/(admin)/administration/compute/sandbox/[id]/page.tsx
//
// The ADMIN seat's record page for one sandbox instance. The user page
// `/sandbox/<id>` treats an admin as an ordinary person, so a sandbox owned by
// someone else is a dead end there; this page reads it through the admin door
// (`GET /api/admin/sandbox/[id]`, lane + super-admin checked server-side) and
// shows every column the row carries.

import { use, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import AppLink from "@/components/navigation/AppLink";
import { AdminUserRef } from "@/features/admin/users/components/AdminUserRef";

type Instance = Record<string, unknown> & { id: string; user_id: string; status: string };

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export default function AdminSandboxDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [instance, setInstance] = useState<Instance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await fetch(`/api/admin/sandbox/${encodeURIComponent(id)}`);
        const body = (await response.json().catch(() => null)) as
          | { instance?: Instance; error?: string }
          | null;
        if (!live) return;
        if (!response.ok || !body?.instance) {
          setError(body?.error ?? `Request failed (${response.status})`);
          return;
        }
        setInstance(body.instance);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <div className="h-full overflow-y-auto px-4 pb-16 pt-4 sm:px-6">
      <div className="mb-4 flex items-center gap-3 text-sm">
        <AppLink href="/administration/compute/sandbox" className="text-muted-foreground hover:underline">
          All sandboxes
        </AppLink>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load this sandbox</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : !instance ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-lg font-semibold">
              {display(instance["sandbox_id"])}
            </h1>
            <Badge variant="secondary">{instance.status}</Badge>
            <AdminUserRef userId={instance.user_id} />
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[14rem_1fr]">
            {Object.entries(instance).map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="font-mono text-xs text-muted-foreground">{key}</dt>
                <dd className="whitespace-pre-wrap break-all font-mono text-xs">{display(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
