"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, Database } from "lucide-react";
import AppLink from "@/components/navigation/AppLink";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { ContentTransferMenu, tableDataFormat, tableSchemaFormat } from "@ai-matrx/alchemy/react";
import {
  directSource,
  type Payload,
  type TransferScope,
} from "@ai-matrx/alchemy/core";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_OFFICIAL_COMPONENTS_SURFACE_NAME,
  createAdminOfficialComponentsScope,
} from "@/features/surfaces/manifests/admin-official-components.manifest";
import { componentList } from "../parts/component-list";

type DemoRow = {
  id: string;
  title: string;
  status: "Ready" | "Review" | "Archived";
  owner: string;
  notes: string;
};

const ROWS: DemoRow[] = [
  {
    id: "brief-01",
    title: "Release brief",
    status: "Ready",
    owner: "Platform",
    notes: "Verified source facts.",
  },
  {
    id: "brief-02",
    title: "Research outline",
    status: "Review",
    owner: "Editorial",
    notes: "Needs one source citation.",
  },
  {
    id: "brief-03",
    title: "Archived launch note",
    status: "Archived",
    owner: "Operations",
    notes: "Kept as an honest sample.",
  },
];

const COLUMNS: MatrxColumnDef<DemoRow>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: (row) => <span className="font-medium">{row.title}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    filter: "select",
    filterOptions: ["Ready", "Review", "Archived"].map((value) => ({
      value,
      label: value,
    })),
  },
  { accessorKey: "owner", header: "Owner", filter: "select" },
  { accessorKey: "notes", header: "Notes" },
];

const ROW_COLUMNS = [
  { id: "title", label: "Title", path: "/title", visible: true },
  { id: "status", label: "Status", path: "/status", visible: true },
  { id: "owner", label: "Owner", path: "/owner", visible: true },
  { id: "notes", label: "Notes", path: "/notes", visible: true },
] as const;

function DemoCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function sourceFrom(
  id: string,
  label: string,
  getPayload: (scope: TransferScope) => Payload,
) {
  return {
    id,
    label,
    capture: async ({
      signal,
      scope,
    }: {
      signal: AbortSignal;
      scope: TransferScope;
    }) => {
      signal.throwIfAborted();
      const payload = getPayload(scope);
      return directSource(payload, {
        id,
        sourceId: id,
        label,
        revision: JSON.stringify(payload),
      });
    },
  };
}

function AlchemyExamples() {
  const [plainText, setPlainText] = useState(
    "The current release brief is ready for a reviewer.",
  );
  const [markdown, setMarkdown] = useState(
    "## Release brief\n\n- Source facts are verified\n- Reviewer note is still needed",
  );
  const [filter, setFilter] = useState<"All" | DemoRow["status"]>("All");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const visibleRows = filter === "All" ? ROWS : ROWS.filter((row) => row.status === filter);
  const selectedRows = ROWS.filter((row) => selectedIds.includes(row.id));
  const component = componentList.find((entry) => entry.id === "alchemy");
  if (!component) {
    throw new Error(
      "The Alchemy catalogue entry is required by its demo route.",
    );
  }

  const getScope = () =>
    createAdminOfficialComponentsScope({
      page_section: "detail",
      total_component_count: componentList.length,
      current_component_id: component.id,
      current_component_name: component.name,
      current_component_description: component.description,
      current_component_path: component.path,
      current_component_categories: component.categories,
      current_component_tags: component.tags ?? [],
      related_component_count: 0,
      context: {
        sample_text: plainText,
        sample_markdown: markdown,
        row_filter: filter,
        visible_sample_rows: visibleRows,
        selected_sample_rows: selectedRows,
      },
    });

  const tableSource = sourceFrom(
    "alchemy-demo:rows",
    "Sample content records",
    (scope) => {
      const rows =
        scope === "selected"
          ? selectedRows
          : scope === "loaded"
            ? ROWS
            : visibleRows;
      return {
        kind: "rows",
        rows,
        columns: [...ROW_COLUMNS],
      };
    },
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_OFFICIAL_COMPONENTS_SURFACE_NAME}
      getScope={getScope}
    >
      <main className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                asChild
                aria-label="Back to Official Components"
              >
                <AppLink href="/administration/ui/official-components">
                  <ArrowLeft className="size-4" />
                </AppLink>
              </Button>
              <h1 className="text-xl font-semibold">
                Alchemy Content Transfer
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              One package-owned control captures the current source only when
              you open it, then offers the formats and destinations the app
              provider has declared.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary">Portal icon</Badge>
            <Badge variant="secondary">Package-owned UI</Badge>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <DemoCard
            title="Editable prose and Markdown draft"
            description="The source is captured when Alchemy opens, so the preparation workspace starts with the current prose and Markdown rather than a stale copy."
          >
            <div className="space-y-2">
              <Label htmlFor="alchemy-plain">Draft prose</Label>
              <Textarea
                id="alchemy-plain"
                value={plainText}
                onChange={(event) => setPlainText(event.target.value)}
              />
              <Label htmlFor="alchemy-markdown">Draft Markdown</Label>
              <Textarea
                id="alchemy-markdown"
                value={markdown}
                onChange={(event) => setMarkdown(event.target.value)}
                className="font-mono text-xs"
              />
              <div className="flex items-center justify-between gap-3 rounded-md border p-2">
                <span className="text-sm text-muted-foreground">
                  Edit either field, then open the package workspace to copy,
                  download, or prepare the current draft.
                </span>
                <ContentTransferMenu
                  source={sourceFrom(
                    "alchemy-demo:draft",
                    "Release draft",
                    () => ({
                      kind: "markdown",
                      text: `${plainText}\n\n${markdown}`,
                    }),
                  )}
                  label="Release draft"
                  triggerVariant="glass"
                  icon="portal"
                />
              </div>
            </div>
          </DemoCard>

          <DemoCard
            title="Nested JSON with native trimming"
            description="This is a structured source, not a hand-built preview. Alchemy applies the declared limits, and its Detail and Custom controls expose the same native JSON reduction workflow."
          >
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <code className="min-w-0 truncate text-xs">{`{ release: { evidence: { sources: [...] } } }`}</code>
              <ContentTransferMenu
                source={sourceFrom(
                  "alchemy-demo:json",
                  "Release evidence",
                  () => ({
                    kind: "json",
                    value: {
                      release: {
                        owner: "Platform",
                        status: "ready",
                        evidence: {
                          sources: [
                            { kind: "source", checked: true, detail: "Release notes matched the tracked change." },
                            { kind: "review", checked: false, detail: "Independent review is still pending." },
                            { kind: "canary", checked: true, detail: "The sample canary completed." },
                          ],
                        },
                      },
                      notes: ["Nested values are sample data only.", "The limits are enforced by the package."],
                    },
                  }),
                )}
                label="Release evidence"
                preferences={{
                  limits: {
                    maxDepth: 3,
                    maxStringChars: 120,
                    maxArrayItems: 2,
                  },
                }}
                triggerVariant="outline"
                icon="portal"
              />
            </div>
          </DemoCard>

          <DemoCard
            title="Selectable tabular data"
            description="MatrxDataTable supplies the selection; the package offers selected rows, the filtered view, and all loaded rows as explicit capture scopes."
          >
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1">
                  <Label htmlFor="alchemy-row-filter">
                    Honest sample filter
                  </Label>
                  <select
                    id="alchemy-row-filter"
                    value={filter}
                    onChange={(event) =>
                      setFilter(event.target.value as typeof filter)
                    }
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    <option>All</option>
                    <option>Ready</option>
                    <option>Review</option>
                    <option>Archived</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedRows.length} selected · {visibleRows.length} in
                    view
                  </span>
                  <ContentTransferMenu
                    source={tableSource}
                    capabilities={{ formats: [tableDataFormat, tableSchemaFormat] }}
                    label="Sample content records"
                    table={{
                      availableScopes: ["selected", "view", "loaded"],
                      initialScope: "view",
                    }}
                    triggerVariant="transparent"
                    icon="portal"
                  />
                </div>
              </div>
              <div className="max-h-[28rem] overflow-auto rounded-md border">
                <MatrxDataTable
                  data={visibleRows}
                  columns={COLUMNS}
                  getRowId={(row) => row.id}
                  pageSize={10}
                  selection={{
                    selectedIds,
                    onSelectedIdsChange: setSelectedIds,
                    noun: "sample",
                  }}
                  emptyState={{
                    icon: <Database className="size-7" />,
                    title: "No matching sample rows",
                    description: "Choose another sample filter.",
                  }}
                />
              </div>
          </DemoCard>

          <DemoCard
            title="Declared multi-section surface"
            description="With no source prop, Alchemy reads the mounted Official Components surface declaration. Its native Sections control lets the user include or omit the declared component detail and gallery values at capture time."
          >
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <p className="font-medium">Official Components detail scope</p>
                <p className="text-sm text-muted-foreground">
                  Component metadata, editable draft state, and the current
                  table selection are supplied by the existing provider.
                </p>
              </div>
              <ContentTransferMenu
                label="Official Components detail scope"
                triggerVariant="transparent"
                icon="portal"
              />
            </div>
          </DemoCard>
        </div>
      </main>
    </SurfaceRuntimeProvider>
  );
}

export default function AlchemyPage() {
  return <AlchemyExamples />;
}
