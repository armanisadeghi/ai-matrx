"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronRight,
  File as FileIcon,
  Folder,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@ai-matrx/design-system";
import { formatFileSize } from "@ai-matrx/kit/format";
import { SettingDoor } from "@/features/settings/doors/SettingDoor";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  ensureEffectiveKnob,
  useEffectiveKnob,
} from "@/lib/scoped-config/effectiveKnobs";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { attachChildToFolder, upsertFiles } from "@/features/files/redux/slice";
import { matchStorageAccept, enforceStorageSelectionMode } from "@/features/files/storage-sources/accept";
import { loadStoragePickerAccounts, type StoragePickerAccount } from "@/features/files/storage-sources/inventory";
import {
  browseStorageSource,
  importStorageSourceFiles,
  safeStorageBasename,
  STORAGE_BROWSE_PAGE_SIZE_KNOB,
} from "@/features/files/storage-sources/service";
import type {
  CanonicalStorageImport,
  StorageBrowseItem,
  StorageBrowseProvider,
  StorageImportFailure,
  StorageImportSelection,
} from "@/features/files/storage-sources/types";
import {
  deliverStorageSourceImports,
  disposeStorageSourcePickerCallbackGroup,
} from "@/features/overlays/callbacks/storageSourcePicker";
import { extractErrorMessage } from "@/utils/errors";

const OVERLAY_ID = "storageSourcePicker" as const;
const WINDOW_ID = "storage-source-picker";
const PROVIDER_LABEL: Record<StorageBrowseProvider, string> = {
  onedrive: "OneDrive",
  dropbox: "Dropbox",
  box: "Box",
};

interface Breadcrumb {
  name: string;
  ref: string | null;
}

export interface StorageSourcePickerWindowProps {
  isOpen: boolean;
  onClose: () => void;
  callbackGroupId: string;
  destinationFolderPath: string;
  accept?: string | null;
  multiple?: boolean;
}

function dedupeItems(items: StorageBrowseItem[]): StorageBrowseItem[] {
  return [...new Map(items.map((item) => [item.item_ref, item])).values()];
}

export function StorageSourcePickerWindow({
  isOpen,
  onClose,
  callbackGroupId,
  destinationFolderPath,
  accept,
  multiple = true,
}: StorageSourcePickerWindowProps) {
  const dispatch = useAppDispatch();
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const userId = useAppSelector(selectUserId);
  /**
   * The page size for the "Load more" LABEL — `undefined` until the register
   * answers, in which case the button says "Load more" rather than promising a
   * number this file made up. The browse itself awaits the same row.
   */
  const rawPageSize = useEffectiveKnob(
    organizationId,
    userId,
    STORAGE_BROWSE_PAGE_SIZE_KNOB,
  );
  const knownPageSize = typeof rawPageSize === "number" ? rawPageSize : null;
  const resolvePageSize = useCallback(async (): Promise<number> => {
    if (!organizationId) {
      throw new Error(
        "This picker cannot tell how many files to list at a time because no organization is " +
          "active yet. Reopen it once your workspace has finished loading.",
      );
    }
    const raw = await ensureEffectiveKnob(
      organizationId,
      userId,
      STORAGE_BROWSE_PAGE_SIZE_KNOB,
    );
    const size = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(
        `The setting "${STORAGE_BROWSE_PAGE_SIZE_KNOB.feature}.` +
          `${STORAGE_BROWSE_PAGE_SIZE_KNOB.key}" is ${JSON.stringify(raw)}, which is not a ` +
          "number of files. Set it to a positive whole number in settings.",
      );
    }
    return size;
  }, [organizationId, userId]);
  const [accounts, setAccounts] = useState<StoragePickerAccount[] | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [provider, setProvider] = useState<StorageBrowseProvider>("onedrive");
  const [connectionId, setConnectionId] = useState("");
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([
    { name: "Files", ref: null },
  ]);
  const [items, setItems] = useState<StorageBrowseItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [browseBusy, setBrowseBusy] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importBusy, setImportBusy] = useState(false);
  const [failures, setFailures] = useState<StorageImportFailure[]>([]);
  const [collisionNames, setCollisionNames] = useState<Record<string, string>>({});
  const [retained, setRetained] = useState<Map<string, CanonicalStorageImport>>(new Map());
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const browseAbortRef = useRef<AbortController | null>(null);
  const cancelRequestedRef = useRef(false);
  const retainedRef = useRef<Map<string, CanonicalStorageImport>>(new Map());

  const providerAccounts = useMemo(
    () => (accounts ?? []).filter((account) => account.provider === provider),
    [accounts, provider],
  );
  const currentFolder = breadcrumbs[breadcrumbs.length - 1];

  const refreshAccounts = useCallback(async () => {
    const generation = ++generationRef.current;
    setAccounts(null);
    setInventoryError(null);
    try {
      const loaded = await loadStoragePickerAccounts();
      if (generation !== generationRef.current) return;
      setAccounts(loaded);
      setProvider((currentProvider) => {
        const nextProvider = loaded.some(
          (account) => account.provider === currentProvider,
        )
          ? currentProvider
          : loaded[0]?.provider ?? currentProvider;
        const nextAccount = loaded.find(
          (account) => account.provider === nextProvider,
        );
        setConnectionId(nextAccount?.id ?? "");
        return nextProvider;
      });
    } catch (error) {
      if (generation !== generationRef.current) return;
      setInventoryError(extractErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (isOpen && !cancelled) return refreshAccounts();
      return undefined;
    });
    return () => {
      cancelled = true;
      generationRef.current += 1;
    };
  }, [isOpen, refreshAccounts]);

  const loadFolder = useCallback(
    async (folder: Breadcrumb, cursor: string | null = null) => {
      if (!connectionId) return;
      const generation = ++generationRef.current;
      browseAbortRef.current?.abort();
      const controller = new AbortController();
      browseAbortRef.current = controller;
      setBrowseBusy(true);
      setBrowseError(null);
      try {
        // THE PAGE SIZE IS THE ORGANIZATION'S, RESOLVED BEFORE THE CALL. One
        // cached register read backs every knob on this screen, so this costs
        // no round trip of its own; an unseeded or unreadable row raises by
        // name into the picker's own error line instead of quietly browsing at
        // a page size nobody chose (law 4).
        const pageSize = await resolvePageSize();
        const page = await browseStorageSource({
          provider,
          connectionId,
          folderRef: folder.ref,
          cursor,
          pageSize,
          signal: controller.signal,
        });
        if (generation !== generationRef.current) return;
        setItems((current) =>
          dedupeItems(cursor ? [...current, ...page.items] : page.items),
        );
        setNextCursor(page.next_cursor ?? null);
        setPageCount((count) => (cursor ? count + 1 : 1));
      } catch (error) {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        setBrowseError(extractErrorMessage(error));
      } finally {
        if (generation === generationRef.current) setBrowseBusy(false);
      }
    },
    [connectionId, provider, resolvePageSize],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setBreadcrumbs([{ name: "Files", ref: null }]);
      setItems([]);
      setNextCursor(null);
      setPageCount(0);
      setSelected(new Set());
      setFailures([]);
      if (connectionId) void loadFolder({ name: "Files", ref: null });
    });
    return () => {
      cancelled = true;
      browseAbortRef.current?.abort();
    };
  }, [connectionId, loadFolder, provider]);

  const selectProvider = (nextProvider: StorageBrowseProvider) => {
    generationRef.current += 1;
    browseAbortRef.current?.abort();
    setProvider(nextProvider);
    setConnectionId(
      accounts?.find((account) => account.provider === nextProvider)?.id ?? "",
    );
    setSelected(new Set());
  };

  const openFolder = (item: StorageBrowseItem) => {
    const crumb = { name: item.name, ref: item.item_ref };
    setBreadcrumbs((current) => [...current, crumb]);
    setSelected(new Set());
    void loadFolder(crumb);
  };

  const goToBreadcrumb = (index: number) => {
    const crumb = breadcrumbs[index];
    setBreadcrumbs((current) => current.slice(0, index + 1));
    setSelected(new Set());
    void loadFolder(crumb);
  };

  const selectableItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.kind === "file" &&
          matchStorageAccept(item.name, item.mime_type, accept ?? undefined).accepted,
      ),
    [accept, items],
  );

  const toggleFile = (item: StorageBrowseItem) => {
    const match = matchStorageAccept(item.name, item.mime_type, accept ?? undefined);
    if (!match.accepted) return;
    setSelected((current) => {
      if (!multiple) return new Set([item.item_ref]);
      const next = new Set(current);
      if (next.has(item.item_ref)) next.delete(item.item_ref);
      else next.add(item.item_ref);
      return next;
    });
  };

  const upsertCanonical = useCallback(
    (files: CanonicalStorageImport[]) => {
      const canonical = files.map((item) => item.file);
      dispatch(upsertFiles(canonical));
      for (const file of canonical) {
        dispatch(
          attachChildToFolder({
            parentFolderId: file.parentFolderId,
            kind: "file",
            id: file.id,
          }),
        );
      }
    },
    [dispatch],
  );

  const finishAndClose = useCallback(() => {
    disposeStorageSourcePickerCallbackGroup(callbackGroupId);
    onClose();
  }, [callbackGroupId, onClose]);

  const deliver = useCallback(
    async (files: CanonicalStorageImport[]): Promise<boolean> => {
      if (!files.length) return true;
      upsertCanonical(files);
      const waiting = new Map(retainedRef.current);
      for (const file of files) waiting.set(file.fileId, file);
      retainedRef.current = waiting;
      setRetained(waiting);
      try {
        await deliverStorageSourceImports(callbackGroupId, files);
        setDeliveryError(null);
        const acknowledged = new Map(retainedRef.current);
        for (const file of files) acknowledged.delete(file.fileId);
        retainedRef.current = acknowledged;
        setRetained(acknowledged);
        return true;
      } catch (error) {
        setDeliveryError(extractErrorMessage(error));
        return false;
      }
    },
    [callbackGroupId, upsertCanonical],
  );

  const runImports = useCallback(
    async (selections: StorageImportSelection[]) => {
      const mode = enforceStorageSelectionMode(selections, multiple);
      if (!mode.accepted) {
        setBrowseError(mode.reason);
        return;
      }
      cancelRequestedRef.current = false;
      setImportBusy(true);
      setFailures([]);
      try {
        const remainingFailures: StorageImportFailure[] = [];
        for (const selection of mode.values) {
          if (cancelRequestedRef.current) break;
          const result = await importStorageSourceFiles({
            provider,
            connectionId,
            selections: [selection],
            destinationFolderPath,
            shouldContinue: () => !cancelRequestedRef.current,
          });
          remainingFailures.push(...result.failures);
          await deliver(result.files);
        }
        setFailures(remainingFailures);
        setCollisionNames((current) => {
          const next = { ...current };
          for (const failure of remainingFailures) {
            if (failure.collisionProposal && !next[failure.selection.sourceRef]) {
              next[failure.selection.sourceRef] = failure.collisionProposal;
            }
          }
          return next;
        });
        setSelected(new Set());
        if (
          retainedRef.current.size === 0 &&
          (cancelRequestedRef.current || remainingFailures.length === 0)
        ) {
          finishAndClose();
        }
      } finally {
        setImportBusy(false);
      }
    },
    [connectionId, deliver, destinationFolderPath, finishAndClose, multiple, provider],
  );

  const importSelected = () => {
    const selections = items
      .filter((item) => selected.has(item.item_ref) && item.kind === "file")
      .map((item) => ({
        sourceRef: item.item_ref,
        name: item.name,
        mimeType: item.mime_type,
      }));
    void runImports(selections);
  };

  const retryFailures = () => {
    const selections = failures.map((failure) => {
      const confirmed = collisionNames[failure.selection.sourceRef];
      return {
        ...failure.selection,
        ...(failure.collisionProposal && safeStorageBasename(confirmed)
          ? { destinationName: confirmed }
          : {}),
      };
    });
    const invalidCollision = failures.some(
      (failure) =>
        failure.collisionProposal &&
        (!safeStorageBasename(collisionNames[failure.selection.sourceRef] ?? "") ||
          !matchStorageAccept(
            collisionNames[failure.selection.sourceRef] ?? "",
            failure.selection.mimeType,
            accept ?? undefined,
          ).accepted),
    );
    if (invalidCollision) {
      setBrowseError("Enter a valid file name for each collision before retrying.");
      return;
    }
    void runImports(selections);
  };

  const retryDelivery = () => {
    void deliver([...retainedRef.current.values()]).then((acknowledged) => {
      if (acknowledged && retainedRef.current.size === 0) finishAndClose();
    });
  };

  const requestClose = () => {
    cancelRequestedRef.current = true;
    browseAbortRef.current?.abort();
    if (!importBusy && retained.size === 0) finishAndClose();
  };

  if (!isOpen) return null;

  return (
    <WindowPanel
      id={WINDOW_ID}
      overlayId={OVERLAY_ID}
      onClose={requestClose}
      title="Import from cloud storage"
      width={720}
      height={620}
      minWidth={360}
      minHeight={420}
      position="center"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <div className="border-b border-border p-3">
          <div className="flex flex-wrap gap-1.5" aria-label="Storage provider">
            {(["onedrive", "dropbox", "box"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={provider === value ? "default" : "outline"}
                onClick={() => selectProvider(value)}
              >
                {PROVIDER_LABEL[value]}
              </Button>
            ))}
          </div>
          {accounts ? (
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="storage-picker-account" className="text-xs font-medium">
                Account
              </label>
              <select
                id="storage-picker-account"
                value={connectionId}
                onChange={(event) => setConnectionId(event.target.value)}
                className="min-h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
              >
                {providerAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}{account.email && account.email !== account.label ? ` — ${account.email}` : ""}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="ghost" onClick={() => void refreshAccounts()}>
                <RefreshCw className="h-4 w-4" /> Retry
              </Button>
            </div>
          ) : null}
        </div>

        {inventoryError ? (
          <HonestError message={inventoryError} onRetry={() => void refreshAccounts()} />
        ) : accounts === null ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking connected accounts
          </div>
        ) : providerAccounts.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-warning" />
            <div>
              <p className="text-sm font-medium">No eligible {PROVIDER_LABEL[provider]} account</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Connect this provider in Integrations, then retry here. OneDrive requires Files.Read.
              </p>
            </div>
            <div className="flex gap-2">
              <SettingDoor target={{ scope: "user", tabId: "integrations", controlId: "storage-connections" }} label="Open Integrations" variant="outline" />
              <Button size="sm" onClick={() => void refreshAccounts()}>Retry</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-2 text-xs">
              {breadcrumbs.map((crumb, index) => (
                <span key={`${crumb.ref ?? "root"}-${index}`} className="flex items-center gap-1">
                  {index > 0 ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : null}
                  <button type="button" className="max-w-40 truncate rounded px-1.5 py-1 hover:bg-muted" onClick={() => goToBreadcrumb(index)}>
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>
            {browseError ? <HonestError message={browseError} onRetry={() => void loadFolder(currentFolder)} /> : null}
            <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
              {!browseBusy && !browseError && items.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">This folder is empty.</p>
              ) : null}
              {items.map((item) => {
                const match = matchStorageAccept(item.name, item.mime_type, accept ?? undefined);
                const isFolder = item.kind === "folder";
                const checked = selected.has(item.item_ref);
                return (
                  <div key={item.item_ref} className="flex min-h-11 items-center gap-2 rounded-md px-2 hover:bg-muted/60">
                    {isFolder ? (
                      <Folder className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Checkbox checked={checked} disabled={!match.accepted} onCheckedChange={() => toggleFile(item)} aria-label={`Select ${item.name}`} />
                    )}
                    <button
                      type="button"
                      disabled={!isFolder && !match.accepted}
                      title={match.reason ?? item.name}
                      onClick={() => (isFolder ? openFolder(item) : toggleFile(item))}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded text-left disabled:opacity-50"
                    >
                      {!isFolder ? <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
                      <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatFileSize(item.size, { fallback: "" })}
                      </span>
                    </button>
                  </div>
                );
              })}
              {browseBusy ? (
                <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading files</div>
              ) : null}
              {nextCursor && pageCount < 20 ? (
                <Button className="mt-2 w-full" variant="outline" disabled={browseBusy} onClick={() => void loadFolder(currentFolder, nextCursor)}>
                  {typeof knownPageSize === "number"
                    ? `Load ${knownPageSize} more`
                    : "Load more"}
                </Button>
              ) : null}
            </div>

            {failures.length ? (
              <div className="max-h-40 overflow-y-auto border-t border-warning/30 bg-warning/5 p-3">
                <p className="text-xs font-medium">Some files still need attention</p>
                {failures.map((failure) => (
                  <div key={failure.selection.sourceRef} className="mt-2 text-xs">
                    <p>{failure.selection.name}: {failure.error}</p>
                    {failure.collisionProposal ? (
                      <Input
                        className="mt-1 h-9"
                        aria-label={`New name for ${failure.selection.name}`}
                        value={collisionNames[failure.selection.sourceRef] ?? failure.collisionProposal}
                        onChange={(event) => setCollisionNames((current) => ({ ...current, [failure.selection.sourceRef]: event.target.value }))}
                      />
                    ) : null}
                  </div>
                ))}
                <Button size="sm" className="mt-2" disabled={importBusy} onClick={retryFailures}>Retry failed imports</Button>
              </div>
            ) : null}

            {retained.size > 0 ? (
              <div className="border-t border-destructive/30 bg-destructive/5 p-3 text-xs">
                <p>{deliveryError ?? `${retained.size} imported file${retained.size === 1 ? " is" : "s are"} waiting to be attached.`}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={retryDelivery}>Retry attaching</Button>
                  <Button size="sm" variant="outline" onClick={finishAndClose}>Keep in Files and close</Button>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2 border-t border-border p-3">
              <span className="text-xs text-muted-foreground">{selected.size} selected · {selectableItems.length} selectable</span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={requestClose}>
                  {importBusy ? "Cancel after current file" : "Cancel"}
                </Button>
                <Button disabled={selected.size === 0 || importBusy} onClick={importSelected}>
                  {importBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Import {selected.size || ""}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </WindowPanel>
  );
}

function HonestError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="m-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1"><p>{message}</p><Button className="mt-2" size="sm" variant="outline" onClick={onRetry}>Retry</Button></div>
    </div>
  );
}

export default StorageSourcePickerWindow;
