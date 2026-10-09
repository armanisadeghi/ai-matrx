"use client";

// features/education/classes/components/ClassStudyContent.tsx
//
// The owner hub's "Study content": everything filed under the class, its parts
// (units, lessons, sections) as a filter row, and the two ways to keep adding —
// "Add sources" (THE Source input: new material or what you already have) and
// "Add content" (decks, quizzes, notes, media, files). With a part selected,
// both add to that part AND the class; every row can be filed into parts and
// removed. Removing archives the link (the item itself is untouched).
// The selected part rides the URL (`?unit=<id>`), so each part has its own link.

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";
import { ArrowUpRight, Layers, MoreHorizontal, Plus, X } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { isEntityTypeToken } from "@ai-matrx/associations";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReadFailure } from "@ai-matrx/design-system";
import { TextInputDialog } from "@ai-matrx/design-system";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { cn } from "@/utils/cn";
import type { StudyClass, ClassContentItem } from "../types";
import type { UseClassContentReturn } from "../hooks/useClassContent";
import {
  useClassParts,
  type UseClassPartsReturn,
} from "../hooks/useClassParts";
import {
  groupsInPart,
  sourceFilingTargets,
  type ClassPart,
} from "../classParts";
import {
  keepSource,
  sourceRefusalSentence,
} from "@/features/sources/api/sourcesApi";
import { AddClassContentSheet } from "./AddClassContentSheet";
import { AddClassSourcesDialog } from "./AddClassSourcesDialog";
import { ClassTestsSection } from "./ClassTestsSection";
import { useClassTests } from "../hooks/useClassTests";

const PART_PARAM = "unit";

function failMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function ClassStudyContent({
  cls,
  content,
}: {
  cls: StudyClass;
  content: UseClassContentReturn;
}) {
  const parts = useClassParts(cls, content);
  const tests = useClassTests(cls, content, parts);

  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [namingPart, setNamingPart] = useState<"new" | ClassPart | null>(null);
  const [naming, setNaming] = useState(false);

  const { selected, selectPart } = useSelectedClassPart(parts.parts);

  const target = selected ?? { id: cls.id, name: cls.name };
  const selectedKeys = selected
    ? (parts.membership.get(selected.id) ?? new Set<string>())
    : null;
  const groups = groupsInPart(content.groups, selectedKeys);
  const shownCount = groups.reduce((n, g) => n + g.items.length, 0);

  /** File one item under the class, and under the selected part when there is one. */
  async function fileItem(
    token: string,
    id: string,
    title?: string,
  ): Promise<void> {
    if (!isEntityTypeToken(token))
      throw new Error(`"${token}" cannot be filed under a class.`);
    const res = await content.attach(token, id, title);
    if (!res.ok) throw new Error(res.error ?? "The class refused it.");
    if (selected) await parts.addToPart(token, id, selected.id);
  }

  /**
   * File one picked Source. A Source (`processed_document`) goes through THE
   * landing door's Keep (`POST /sources/{id}/keep`) with the class — and the
   * selected part — as its targets, in one server write; anything else picked
   * as-is (a note, a file, a transcript record) is an existing record filed
   * through the association door like "Add content".
   */
  async function fileSource(token: string, id: string): Promise<void> {
    if (token !== "processed_document") return fileItem(token, id);
    try {
      await keepSource(id, {
        attachTo: sourceFilingTargets(cls.id, selected?.id ?? null),
        organizationId: cls.organizationId,
      });
    } catch (err) {
      throw new Error(sourceRefusalSentence(err), { cause: err });
    }
    await content.reload();
    if (selected) await parts.reloadMembership();
  }

  async function removeItem(item: ClassContentItem) {
    if (selected) {
      const ok = await confirm({
        title: `Take ${item.title} out of ${selected.name}?`,
        description: `It stays in ${cls.name}.`,
        confirmLabel: "Take out",
      });
      if (!ok) return;
      try {
        await parts.removeFromPart(item.token, item.entityId, selected.id);
      } catch (err) {
        toast.error(
          `Could not take it out of ${selected.name}: ${failMessage(err)}`,
        );
      }
      return;
    }
    const ok = await confirm({
      title: `Remove ${item.title} from ${cls.name}?`,
      description:
        "It leaves the class and its units. The item itself is not deleted.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    if (!isEntityTypeToken(item.token)) return;
    try {
      for (const partId of parts.partsHolding(item.token, item.entityId)) {
        await parts.removeFromPart(item.token, item.entityId, partId);
      }
      const res = await content.detach(item.token, item.entityId);
      if (!res.ok) throw new Error(res.error ?? "the class refused it");
    } catch (err) {
      toast.error(`Could not remove ${item.title}: ${failMessage(err)}`);
    }
  }

  async function togglePart(
    item: ClassContentItem,
    part: ClassPart,
    inPart: boolean,
  ) {
    try {
      if (inPart)
        await parts.removeFromPart(item.token, item.entityId, part.id);
      else await parts.addToPart(item.token, item.entityId, part.id);
    } catch (err) {
      toast.error(`Could not change ${part.name}: ${failMessage(err)}`);
    }
  }

  async function savePartName(name: string) {
    setNaming(true);
    try {
      if (namingPart === "new") {
        const part = await parts.createPart(name);
        selectPart(part.id);
      } else if (namingPart) {
        await parts.renamePart(namingPart.id, name);
      }
      setNamingPart(null);
    } catch (err) {
      toast.error(failMessage(err));
    } finally {
      setNaming(false);
    }
  }

  async function removePart(part: ClassPart) {
    const ok = await confirm({
      title: `Remove ${part.name}?`,
      description: `Its items stay in ${cls.name}. You can restore it from archived scopes.`,
      confirmLabel: `Remove ${parts.nounSingular.toLowerCase()}`,
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await parts.removePart(part.id);
      selectPart(null);
    } catch (err) {
      toast.error(`Could not remove ${part.name}: ${failMessage(err)}`);
    }
  }

  const pickerKeys = selectedKeys ?? content.attachedKeys;

  return (
    <>
    <ClassTestsSection
      classParam={cls.id}
      tests={tests}
      units={parts.parts}
      unitNounPlural={parts.nounPlural}
      canEdit
    />
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">
          Study content
          {!content.error && content.totalCount > 0 && (
            <span className="ml-1.5 text-muted-foreground">
              ({content.totalCount})
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1.5">
          <Button
            icon={<Plus />}
            variant="primary"
            onClick={() => setSourcesOpen(true)}
          >
            Add sources
          </Button>
          <Button
            icon={<Plus />}
            variant="outline"
            onClick={() => setPickerOpen(true)}
          >
            Add content
          </Button>
        </div>
      </div>

      {/* Parts: All · Unit 1 · Unit 2 · + Unit */}
      <div className="flex items-center gap-1.5">
        <ClassPartChips
          parts={parts}
          selectedId={selected?.id ?? null}
          onSelect={selectPart}
        />
        <Button
          icon={<Plus />}
          variant="quiet"
          className="shrink-0"
          onClick={() => setNamingPart("new")}
        >
          {parts.nounSingular}
        </Button>
        {selected && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                icon={<MoreHorizontal />}
                variant="quiet"
                className="shrink-0"
                aria-label={`${selected.name} options`}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setNamingPart(selected)}>
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => void removePart(selected)}
              >
                Remove {parts.nounSingular.toLowerCase()}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {content.loading ||
      (selected && parts.membershipLoading && parts.membership.size === 0) ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : content.error ? (
        <ReadFailure
          error={content.error}
          what="this class's study content"
          onRetry={() => void content.reload()}
          className="m-0"
        />
      ) : selected && parts.membershipError ? (
        <ReadFailure
          error={parts.membershipError}
          what={`what ${selected.name} holds`}
          onRetry={() => void parts.reloadMembership()}
          className="m-0"
        />
      ) : shownCount === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {selected
              ? `Nothing in ${selected.name} yet.`
              : "Nothing in this class yet."}
          </p>
          <Button
            icon={<Plus />}
            variant="primary"
            onClick={() => setSourcesOpen(true)}
          >
            Add sources
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.group} className="space-y-1.5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.group}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <ContentRow
                    key={item.edgeId}
                    item={item}
                    parts={parts.parts}
                    nounPlural={parts.nounPlural}
                    holding={parts.partsHolding(item.token, item.entityId)}
                    removeLabel={
                      selected
                        ? `Take out of ${selected.name}`
                        : `Remove from ${cls.name}`
                    }
                    onTogglePart={(part, inPart) =>
                      void togglePart(item, part, inPart)
                    }
                    onRemove={() => void removeItem(item)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <AddClassSourcesDialog
        open={sourcesOpen}
        onOpenChange={setSourcesOpen}
        target={target}
        onFile={(token, id) => fileSource(token, id)}
      />
      <AddClassContentSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        className={target.name}
        attachedKeys={pickerKeys}
        onAttach={async (token, id, title) => {
          try {
            await fileItem(token, id, title);
            return { ok: true };
          } catch (err) {
            return { ok: false, error: failMessage(err) };
          }
        }}
        onDetach={async (token, id) => {
          try {
            if (selected) await parts.removeFromPart(token, id, selected.id);
            else {
              for (const partId of parts.partsHolding(token, id)) {
                await parts.removeFromPart(token, id, partId);
              }
              const res = await content.detach(token, id);
              if (!res.ok) throw new Error(res.error ?? "the class refused it");
            }
            return { ok: true };
          } catch (err) {
            return { ok: false, error: failMessage(err) };
          }
        }}
      />
      <TextInputDialog
        open={namingPart !== null}
        onOpenChange={(o) => !naming && !o && setNamingPart(null)}
        title={
          namingPart === "new"
            ? `New ${parts.nounSingular.toLowerCase()}`
            : `Rename ${namingPart?.name ?? ""}`
        }
        placeholder="Unit 1 — Cells"
        defaultValue={namingPart && namingPart !== "new" ? namingPart.name : ""}
        confirmLabel={namingPart === "new" ? "Add" : "Save"}
        busy={naming}
        onConfirm={(name) => savePartName(name)}
      />
    </section>
    </>
  );
}

/**
 * Which part the URL selects (`?unit=<id>`) and how to select another. Query
 * state only — never a navigation (no `?_rsc=` round trip, no remount).
 */
export function useSelectedClassPart(parts: readonly ClassPart[]): {
  selected: ClassPart | null;
  selectPart: (partId: string | null) => void;
} {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const wantedPartId = searchParams.get(PART_PARAM);
  const selected = parts.find((p) => p.id === wantedPartId) ?? null;

  function selectPart(partId: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (partId) next.set(PART_PARAM, partId);
    else next.delete(PART_PARAM);
    const query = next.toString();
    replaceAddressWithoutNavigating(query ? `${pathname}?${query}` : pathname);
  }

  return { selected, selectPart };
}

/** The part filter row: All · Unit 1 · Unit 2 … (owner and member hubs). */
export function ClassPartChips({
  parts,
  selectedId,
  onSelect,
}: {
  parts: Pick<
    UseClassPartsReturn,
    "parts" | "nounPlural" | "membership" | "membershipError"
  >;
  selectedId: string | null;
  onSelect: (partId: string | null) => void;
}) {
  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5"
      role="tablist"
      aria-label={parts.nounPlural}
    >
      <PartChip
        label="All"
        active={!selectedId}
        onClick={() => onSelect(null)}
      />
      {parts.parts.map((p) => (
        <PartChip
          key={p.id}
          label={p.name}
          count={
            parts.membershipError
              ? undefined
              : parts.membership.get(p.id)?.size
          }
          active={selectedId === p.id}
          onClick={() => onSelect(p.id)}
        />
      ))}
    </div>
  );
}

function PartChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={count ? `${label} (${count})` : label}
      onClick={onClick}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1 rounded-full border px-3 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-accent",
      )}
    >
      <span className="max-w-[12rem] truncate">{label}</span>
      {count != null && count > 0 && (
        <span
          className={
            active ? "text-primary-foreground/80" : "text-muted-foreground"
          }
        >
          {count}
        </span>
      )}
    </button>
  );
}

function ContentRow({
  item,
  parts,
  nounPlural,
  holding,
  removeLabel,
  onTogglePart,
  onRemove,
}: {
  item: ClassContentItem;
  parts: ClassPart[];
  nounPlural: string;
  holding: string[];
  removeLabel: string;
  onTogglePart: (part: ClassPart, inPart: boolean) => void;
  onRemove: () => void;
}) {
  const Icon = item.Icon;
  const inner = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {item.title}
      </span>
      {item.href && (
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
    </>
  );
  const holdingNames = parts
    .filter((p) => holding.includes(p.id))
    .map((p) => p.name);
  return (
    <li className="flex items-center gap-1 rounded-lg border border-border bg-card pr-1">
      {item.href ? (
        // A real record opens through a real link (new tab, middle-click).
        <Link
          href={item.href}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-l-lg px-3 py-2 text-left transition-colors hover:bg-accent"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2">
          {inner}
        </div>
      )}
      {parts.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              icon={<Layers />}
              variant="quiet"
              className="shrink-0"
              aria-label={`${nounPlural} for ${item.title}`}
              title={holdingNames.length ? holdingNames.join(", ") : nounPlural}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{nounPlural}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {parts.map((p) => {
              const inPart = holding.includes(p.id);
              return (
                <DropdownMenuCheckboxItem
                  key={p.id}
                  checked={inPart}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => onTogglePart(p, inPart)}
                >
                  {p.name}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        icon={<X />}
        variant="quiet"
        className="shrink-0"
        aria-label={removeLabel}
        title={removeLabel}
        onClick={onRemove}
      />
    </li>
  );
}
