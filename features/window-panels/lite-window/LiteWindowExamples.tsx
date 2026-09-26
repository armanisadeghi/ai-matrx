"use client";

/**
 * THE LIGHTWEIGHT WINDOW — three working examples, for approval in practice.
 *
 * Arman, 2026-09-18: *"create a slightly more lightweight version of the window
 * panel and start using that as the default for replacing modals … carries the
 * basics of dragging"*, and *"it's best to approve some of this if you made an
 * example of your perfect setup and gave me a link to approve it."*
 *
 * The primitive is `MatrxDynamicPanelHost presentation="floating"` — the SAME
 * panel host already used in 59 files, with a second presentation rather than a
 * sixth floating-surface family. Everything on this page is live: the forms
 * write real rows in the organization you have active, and the picker lists the
 * real context items of the scope type you choose.
 *
 * The three examples answer the three questions Arman's ruling raises:
 *   A — can a real multi-field FORM live in one, instead of a blocking modal?
 *   B — can a PICKER's `Create "…"` open that form beside it and select it?
 *   C — does one open correctly from INSIDE a heavy WindowPanel (stacking)?
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { PanelTop, Plus, SquareStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CreatablePicker,
  type CreatableOption,
} from "@/components/ui/creatable-picker";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { AddScopeModal } from "@/features/scope-system/components/AddScopeModal";
import { ContextItemAddForm } from "@/features/scope-system/components/ContextItemAddForm";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import {
  listScopeTypeItems,
  selectItemsByType,
  selectItemsLoadedForType,
} from "@/features/scopes/redux/contextItemCatalog";
import { toast } from "@/lib/toast";
import { contextItemsHref } from "@/features/scopes/lib/scopeRoutes";
import {
  selectScopeTypesByOrg,
  selectScopeTypesLoadedForOrg,
} from "@/features/scopes/redux/selectors/admin";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { AGENT_ICON } from "@/components/icons/domain-icons";

const WindowPanel = dynamic(
  () => import("@/features/window-panels/WindowPanel"),
  { ssr: false },
);

export function LiteWindowExamples() {
  const dispatch = useAppDispatch();
  // 🚨 THREE STATES, NEVER A NULLABLE ID (check:org-three-states, 2026-09-22).
  // This page used to read the active organization id and, whenever it was
  // null, spell "Pick an organization in the header first" — which is the
  // terminal refusal stated during boot, and stated again when the membership
  // read FAILED. The gate tells checking, refused, failed and signed-out apart;
  // the notice spells whichever one is true, with its own remedy.
  const { organizationId, organizationState } = useOrganizationRequired();
  const orgId = organizationState === "ready" ? (organizationId ?? "") : "";
  const typesLoaded = useAppSelector((s) =>
    orgId ? selectScopeTypesLoadedForOrg(s, orgId) : false,
  );
  const scopeTypes = useAppSelector((s) =>
    orgId ? selectScopeTypesByOrg(s, orgId) : [],
  );

  useEffect(() => {
    if (orgId && !typesLoaded) dispatch(ensureScopeTree());
  }, [dispatch, orgId, typesLoaded]);

  // ── A ──────────────────────────────────────────────────────────────────────
  const [addScopeOpen, setAddScopeOpen] = useState(false);

  // ── C ──────────────────────────────────────────────────────────────────────
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [noteWindowOpen, setNoteWindowOpen] = useState(false);
  const [note, setNote] = useState("");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">
          The lightweight window
        </h1>
        <p className="text-sm text-muted-foreground">
          A draggable, resizable, non-blocking frame for pickers and forms. The
          page behind stays live and scrollable — try scrolling this page with a
          window open, and drag a window by its title bar. Below 768px wide each
          one becomes a bottom drawer <em>without losing what you typed</em>.
        </p>
      </header>

      <OrganizationContextNotice
        state={organizationState}
        what="These window examples"
        description="Pick an organization in the header — every example below writes into the organization you have active, and nothing here guesses one for you."
        compact
        className="rounded-md border border-border bg-muted/40"
      />

      {/* ── A — a real form in a lightweight window ─────────────────────── */}
      <section className="space-y-2 rounded-lg border border-border p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <PanelTop className="h-4 w-4" />A — a form in a lightweight window
        </h2>
        <p className="text-sm text-muted-foreground">
          This is the real <strong>Add a scope type</strong> form, byte for
          byte, with the floating host instead of the docked one. Type a name,
          then drag the window, scroll the page, resize the window from its
          right edge or bottom-right corner — nothing you typed moves.
        </p>
        <Button
          size="sm"
          onClick={() => setAddScopeOpen(true)}
          disabled={!orgId}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add a scope type
        </Button>
        {orgId && (
          <AddScopeModal
            open={addScopeOpen}
            onOpenChange={setAddScopeOpen}
            orgId={orgId}
            presentation="floating"
          />
        )}
      </section>

      {/* ── B — a picker that creates in place ──────────────────────────── */}
      <ContextItemPickerExample
        orgId={orgId}
        scopeTypes={scopeTypes.map((t) => ({
          id: t.id,
          label: t.label_plural,
          slug: t.slug ?? null,
        }))}
      />

      {/* ── C — a lightweight window opened from a heavy WindowPanel ─────── */}
      <section className="space-y-2 rounded-lg border border-border p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SquareStack className="h-4 w-4" />C — opened from inside a heavy
          window
        </h2>
        <p className="text-sm text-muted-foreground">
          Open the workbench (a full <code>WindowPanel</code>: traffic lights,
          minimize, the tray), then open the lightweight window from inside it.
          The light one lands <strong>above</strong> the workbench; clicking the
          workbench raises it back above — one z-order, not two.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setWorkbenchOpen(true)}
        >
          <AGENT_ICON className="mr-1.5 h-4 w-4" />
          Open the heavy workbench
        </Button>

        {workbenchOpen && (
          <WindowPanel
            id="lite-window-demo-workbench"
            title="Heavy workbench"
            onClose={() => setWorkbenchOpen(false)}
            width={560}
            height={380}
            bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
          >
            <div className="flex flex-col gap-3 p-4">
              <p className="text-sm text-muted-foreground">
                A durable workbench — it minimizes to the tray and remembers
                where it was. The note below is edited in a lightweight window
                that must never land behind this one.
              </p>
              <Button size="sm" onClick={() => setNoteWindowOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Edit the note
              </Button>
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
                {note.trim() ? note : "No note yet."}
              </div>
            </div>
          </WindowPanel>
        )}

        {/*
          The open state lives HERE — on the page, above every presentation
          switch — not inside the window. That is the law's §5: crossing 768
          re-renders the window, it never unmounts it.
        */}
        <MatrxDynamicPanelHost
          open={noteWindowOpen}
          onOpenChange={setNoteWindowOpen}
          presentation="floating"
          floatingSize="sm"
          title="Note"
          description="Opened from inside the workbench."
          footer={
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNoteWindowOpen(false)}
              >
                Close
              </Button>
            </div>
          }
        >
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Type here, then click the workbench behind — this window stays open and keeps every character."
            className="h-40 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </MatrxDynamicPanelHost>
      </section>
    </div>
  );
}

/**
 * B — THE PICKER THAT TAKES NEW INPUT.
 *
 * Type something that matches no context item, choose `Create "…"`, and the
 * record's own form opens in a lightweight window BESIDE the picker with the
 * text already in it. On save the new item is selected immediately, and a toast
 * says what was created and where it lives — the law's §1, §2 and §6.
 */
function ContextItemPickerExample({
  orgId,
  scopeTypes,
}: {
  orgId: string;
  scopeTypes: { id: string; label: string; slug: string | null }[];
}) {
  const dispatch = useAppDispatch();
  const [scopeTypeId, setScopeTypeId] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  const itemsLoaded = useAppSelector((s) =>
    scopeTypeId ? selectItemsLoadedForType(s, scopeTypeId) : false,
  );
  const items = useAppSelector((s) =>
    scopeTypeId ? selectItemsByType(s, scopeTypeId) : [],
  );

  useEffect(() => {
    if (scopeTypeId && !itemsLoaded) dispatch(listScopeTypeItems(scopeTypeId));
  }, [dispatch, itemsLoaded, scopeTypeId]);

  const options: CreatableOption[] = useMemo(
    () =>
      items.map((item) => ({
        value: item.id,
        label: item.display_name,
        hint: item.description ?? undefined,
      })),
    [items],
  );

  const scopeType = scopeTypes.find((t) => t.id === scopeTypeId);
  // THE MANAGE DOOR — a new tab, so nobody loses this picker to go look at the
  // catalog. It is a companion to in-place creation, never a substitute.
  const manageHref =
    orgId && scopeType ? contextItemsHref(orgId, scopeType) : null;

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Plus className="h-4 w-4" />B — a picker that creates the record beside
        it
      </h2>
      <p className="text-sm text-muted-foreground">
        Pick a scope type, then type a context item name that does not exist and
        choose <em>Create</em>. A context item needs more than a name, so the
        typed text is handed to its own form in a lightweight window — never
        retyped, never a page navigation.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Scope type</Label>
          <Select value={scopeTypeId} onValueChange={setScopeTypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a scope type…" />
            </SelectTrigger>
            <SelectContent>
              {scopeTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Context item</Label>
          <CreatablePicker
            value={selected}
            options={options}
            onSelect={setSelected}
            placeholder="Select a context item…"
            searchPlaceholder="Search or type a new context item…"
            noun="context item"
            onCreateRequiresMore={(typed) => setDraft(typed)}
            manageAction={
              scopeType
                ? {
                    label: `Manage ${scopeType.label} context items`,
                    href: manageHref ?? "",
                  }
                : undefined
            }
            disabled={!scopeTypeId}
            loading={Boolean(scopeTypeId) && !itemsLoaded}
            ariaLabel="Context item"
          />
        </div>
      </div>

      {scopeTypeId && scopeType && (
        <MatrxDynamicPanelHost
          open={draft !== null}
          onOpenChange={(next) => {
            if (!next) setDraft(null);
          }}
          presentation="floating"
          floatingSize="md"
          title={`New ${scopeType.label} context item`}
          description="Created here, selected here — the typed name came with it."
        >
          <ContextItemAddForm
            scopeTypeId={scopeTypeId}
            labelPlural={scopeType.label}
            initialName={draft ?? ""}
            onAdded={(item) => {
              setSelected(item.id);
              toast.success(`Created "${item.display_name}"`, {
                description: `It lives in ${scopeType.label} and is selected above.`,
              });
            }}
            onClose={() => setDraft(null)}
          />
        </MatrxDynamicPanelHost>
      )}
    </section>
  );
}
