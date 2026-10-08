"use client";

// features/spaces/public/PublicSpace.tsx — a page published to the web, read by anyone (J1, O10, I4).
//
// Notion's public page: the same blocks through the same editor, read-only — no block handles, no "/" menu,
// no New row, no comments. Top bar: the breadcrumb of parents that are on the web too, and Duplicate when
// the owner allows it (it runs inside the app, /spaces/duplicate: signed out signs in first). Page links open only pages that are on the web;
// any other reads "Not published". Rows of a database block are the ones this page published with it
// (`content.space_public_view` → `databases`: that block's own views, as the publisher sees them), read-only.

import { Button } from "@ai-matrx/design-system/controls";
import { Copy, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

import { MadeWithAiMatrx } from "@/components/matrx/MadeWithAiMatrx";

import type {
  SpaceBlock,
  SpaceDoc,
  SpaceId,
  SpaceMedia,
  SpaceSummary,
} from "../contract";
import { PublishedRowsProvider } from "../data/published-rows";
import { SpaceEditor } from "../editor/SpaceEditor";
import { Cover } from "../page/Cover";
import { PublishedMediaProvider } from "../page/media";
import { SpaceIcon } from "../page/SpaceIcon";
import {
  StaticSpacesProvider,
  type SpacesContextValue,
} from "../state/SpacesProvider";
import {
  parsePublicIcon,
  type PublicPageRef,
  type PublicSpaceView,
} from "./public-view";

const READ_ONLY = (what: string) => () => {
  throw new Error(`${what} is not available on a published page.`);
};

function summary(p: PublicPageRef): SpaceSummary {
  return {
    id: p.id,
    parentId: null,
    position: "0",
    title: p.title,
    icon: parsePublicIcon(p.icon),
    isArchived: false,
    updatedAt: "",
  };
}

function useStaticValue(
  view: PublicSpaceView,
  go: (id: SpaceId) => void,
): SpacesContextValue {
  const pages = [
    ...view.path,
    ...view.children,
    ...view.links,
    { id: view.id, slug: view.slug, title: view.title, icon: view.icon },
  ];
  const byId = new Map(pages.map((p) => [p.id, summary(p)]));
  const href = (id: SpaceId) =>
    `/site/${pages.find((p) => p.id === id)?.slug ?? id}`;
  const noop = () => {};
  const refuse = READ_ONLY("This");
  return {
    store: new Proxy({} as SpacesContextValue["store"], { get: () => refuse }),
    ready: true,
    loadError: null,
    access: null,
    retryLoad: noop,
    patchSummary: noop,
    takeFocusTitle: () => false,
    openToName: () => undefined,
    takeFresh: () => null,
    pageEpoch: () => 0,
    reopenPage: noop,
    sample: { adding: false, progress: null, add: async () => refuse() },
    templates: {
      ids: [],
      error: null,
      refresh: noop,
      setTemplate: async () => refuse(),
      use: async () => refuse(),
    },
    summaries: [...byId.values()],
    archived: [],
    loadTrash: noop,
    trashLoaded: true,
    // The published page carries its own children; nothing loads lazily here.
    childrenLoaded: () => true,
    loadChildren: async () => {},
    reveal: noop,
    byId,
    childrenOf: (parentId) =>
      parentId === view.id ? view.children.map(summary) : [],
    pathTo: () => [
      ...view.path.map(summary),
      summary({
        id: view.id,
        slug: view.slug,
        title: view.title,
        icon: view.icon,
      }),
    ],
    favorites: [],
    toggleFavorite: noop,
    recent: [],
    markVisited: noop,
    createSpace: async () => refuse(),
    archiveSpace: async () => refuse(),
    restoreSpace: async () => refuse(),
    duplicateSpace: async () => refuse(),
    moveSpace: async () => refuse(),
    open: (id) => (byId.has(id) ? go(id) : undefined),
    quickFind: { open: false, mode: "jump" },
    openQuickFind: noop,
    closeQuickFind: noop,
    sidebarCollapsed: true,
    setSidebarCollapsed: noop,
    mobileSidebarOpen: false,
    setMobileSidebarOpen: noop,
    pageHref: href,
    missingPageLabel: "Not published",
  };
}

function DuplicateButton({ view }: { view: PublicSpaceView }) {
  // Duplicate happens inside the app (/spaces/duplicate): a signed-out visitor signs in and comes back,
  // and the copy is filed in the organization the person works in.
  const target = `/spaces/duplicate?from=${encodeURIComponent(view.slug ?? view.id)}`;
  return (
    <Button
      variant="outline"
      icon={<Copy size={15} />}
      onClick={() => window.location.assign(target)}
      data-testid="public-duplicate"
    >
      Duplicate
    </Button>
  );
}

const NO_SUBSCRIBE = () => () => undefined;

export function PublicSpace({ view }: { view: PublicSpaceView }) {
  const router = useRouter();
  // BlockNote 0.55 reads `window` while it creates the editor, so the server renders the page's frame
  // (title, cover, icon) and the browser draws the blocks — a server render of the editor answered 500.
  const inBrowser = useSyncExternalStore(
    NO_SUBSCRIBE,
    () => true,
    () => false,
  );
  const value = useStaticValue(view, (id) => {
    const target = [...view.path, ...view.children, ...view.links].find(
      (p) => p.id === id,
    );
    router.push(`/site/${target?.slug ?? id}`);
  });
  const snapshot = view.snapshot;
  const settings: SpaceDoc["settings"] = {
    font: "default",
    smallText: false,
    fullWidth: false,
    locked: false,
    ...(snapshot.settings ?? {}),
  };
  const icon: SpaceMedia | null = snapshot.icon ?? parsePublicIcon(view.icon);
  const blocks: SpaceBlock[] = Array.isArray(snapshot.blocks)
    ? snapshot.blocks
    : [];
  const fontClass =
    settings.font === "serif"
      ? "spaces-font-serif"
      : settings.font === "mono"
        ? "spaces-font-mono"
        : "";
  const crumbs = [
    ...view.path,
    { id: view.id, slug: view.slug, title: view.title, icon: view.icon },
  ];
  return (
    <StaticSpacesProvider value={value}>
      <PublishedMediaProvider media={view.media}>
      <div
        className="spaces-root relative z-0 h-dvh overflow-hidden"
        data-public-page=""
      >
        <div className="spaces-frame">
          <main className="spaces-main">
            <div
              className="spaces-page"
              data-full-width={settings.fullWidth ? "true" : undefined}
              data-small-text={settings.smallText ? "true" : undefined}
            >
              <header className="spaces-topbar">
                <nav className="spaces-breadcrumb" aria-label="Breadcrumb">
                  {crumbs.map((p, i) => (
                    <span key={p.id} className="flex min-w-0 items-center">
                      {i > 0 ? (
                        <span className="spaces-breadcrumb-sep">/</span>
                      ) : null}
                      <Link
                        href={`/site/${p.slug ?? p.id}`}
                        className="spaces-breadcrumb-item"
                        data-current={
                          i === crumbs.length - 1 ? "true" : undefined
                        }
                      >
                        {p.icon ? (
                          <SpaceIcon
                            media={parsePublicIcon(p.icon)}
                            size={16}
                          />
                        ) : (
                          <FileText size={16} strokeWidth={1.6} />
                        )}
                        <span className="truncate">
                          {p.title || "Untitled"}
                        </span>
                      </Link>
                    </span>
                  ))}
                </nav>
                <span className="flex-1" />
                {view.allowDuplicate ? <DuplicateButton view={view} /> : null}
              </header>
              <div className="spaces-body">
                <div className="spaces-scroll" data-matrx-page-scroll="">
                  {snapshot.cover ? (
                    <Cover
                      cover={snapshot.cover}
                      editable={false}
                      onChange={() => {}}
                    />
                  ) : null}
                  <div className={`spaces-content ${fontClass}`}>
                    <div
                      className="spaces-header"
                      data-has-cover={snapshot.cover ? "true" : undefined}
                      data-has-icon={icon ? "true" : undefined}
                    >
                      {icon ? (
                        <span
                          className="spaces-page-icon"
                          data-image={!("icon" in icon) ? "true" : undefined}
                        >
                          <SpaceIcon
                            media={icon}
                            size={!("icon" in icon) ? 136 : 78}
                          />
                        </span>
                      ) : null}
                      <h1 className="spaces-title" data-testid="public-title">
                        {view.title || "Untitled"}
                      </h1>
                    </div>
                    {inBrowser ? (
                      <PublishedRowsProvider databases={view.databases} entities={view.entities}>
                        <SpaceEditor
                          spaceId={view.id}
                          initialBlocks={blocks}
                          editable={false}
                          onChange={() => {}}
                          slash={{
                            createSubpage: READ_ONLY("Adding a page"),
                            pickPage: async () => null,
                            pickSource: async () => null,
                            newDatabase: async () => null,
                          }}
                          menu={{
                            moveBlocksTo: READ_ONLY("Moving blocks"),
                            turnIntoPageIn: READ_ONLY(
                              "Turning blocks into a page",
                            ),
                            askAi: () => {},
                          }}
                        />
                      </PublishedRowsProvider>
                    ) : null}
                    <div className="spaces-page-end" aria-hidden />
                  </div>
                  <MadeWithAiMatrx />
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
      </PublishedMediaProvider>
    </StaticSpacesProvider>
  );
}
