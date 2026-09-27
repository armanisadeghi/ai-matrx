// features/flashcards/components/home/FlashcardsHome.tsx
//
// The list-first home for the Flashcards tool (/education/flashcards): the
// learner's deck library on the canonical list shell (`EntityListPage`), so it
// sorts and filters on every column, keeps view preferences, has scope lanes,
// the archive axis, per-row right-click menus, Copy / Copy for AI and phone
// cards. The list's service, columns and row actions live in
// ./flashcardSetList.tsx and ./useFlashcardSetRowActions.tsx.
//
// Page-level actions (review, weak areas, progress, import, export, …) live in
// the shell header through EducationToolHeader; "Create deck" sits beside the
// scope tabs. The cross-mode study streak rides the header too, so the list
// starts right under it.
//
// `/education/flashcards-2` renders this with `actionLayout="page"` — an
// isolated comparison concept that shows the actions as an in-page panel.

"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ComponentType,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  INTELLIGENCE_ICON,
  INTELLIGENCE_ICON_NAME,
} from "@/components/icons/domain-icons";
import {
  CalendarClock,
  CloudOff,
  Download,
  FileSearch,
  Flame,
  Loader2,
  Plus,
  TrendingUp,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EducationToolHeader,
  type EducationToolAction,
} from "@/features/education/components/EducationToolHeader";
import { fcService } from "../../data/fcService";
import type { CardWithDetails, FcSetRow } from "../../data/types";
import { toast } from "@/lib/toast";
import { buildLibraryJson, downloadTextFile } from "../../utils/exportDeck";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { studyService } from "@/features/education/study/service/studyService";
import type { StudyStreakRow } from "@/features/education/study/types";
import { featureIntelligenceHref } from "@/features/mandates/feature-intelligence/hrefs";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityListSurfaceController } from "@/lib/entity-list/components/EntityListPage";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { useLoginHref } from "@/hooks/auth/useLoginHref";
import {
  FLASHCARD_SETS_BASE,
  buildFlashcardSetListConfig,
  type FlashcardSetListRow,
} from "./flashcardSetList";
import { useFlashcardSetRowActions } from "./useFlashcardSetRowActions";
import { buildDeckScope, buildDeckWriteHandlers } from "./deckSurface";

const EDU_BASE = FLASHCARD_SETS_BASE;
const FOLDER_DIMENSION = CATEGORY_DIMENSIONS.flashcardFolder;
const SURFACE_NAME = "matrx-user/education-flashcards";

function StreakChip({ streak }: { streak: StudyStreakRow | null }) {
  if (!streak || streak.current_streak <= 0) return null;
  const days = streak.current_streak;
  return (
    <span
      className="mr-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
      title={`Study streak across every mode. Longest: ${streak.longest_streak} day${streak.longest_streak === 1 ? "" : "s"}`}
      aria-label={`Study streak: ${days} day${days === 1 ? "" : "s"}`}
    >
      <Flame className="h-3.5 w-3.5" />
      {days}
      {/* On a phone the number alone: the tab row needs the room for the
          Shared and Public lanes (page-pass 2026-09-27). */}
      <span className="max-sm:sr-only">day{days === 1 ? "" : "s"}</span>
    </span>
  );
}

export function FlashcardsHome({
  actionLayout = "header",
}: {
  actionLayout?: "header" | "page";
}) {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const authReady = useAppSelector(selectAuthReady);
  const loginHref = useLoginHref();
  const [isPending, startTransition] = useTransition();
  const [streak, setStreak] = useState<StudyStreakRow | null>(null);
  const [exportingLibrary, setExportingLibrary] = useState(false);
  const { categories: folders } = useCategories({
    dimension: FOLDER_DIMENSION,
  });

  const folderNames = new Map(folders.map((f) => [f.id, f.name]));
  // A folder id the taxonomy has not named yet still shows, honestly.
  const folderName = (id: string) => folderNames.get(id) ?? "Unnamed folder";
  const foldersKey = folders.map((f) => `${f.id}:${f.name}`).join("|");
  const config = useMemo(
    () =>
      userId
        ? buildFlashcardSetListConfig({
            userId,
            useRowActions: useFlashcardSetRowActions,
            folderName: (id) => folderNames.get(id) ?? "Unnamed folder",
            foldersKey,
          })
        : null,
    // folderNames is derived from foldersKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, foldersKey],
  );

  // Phase 3 (daily streak): read-only — the streak row is written exclusively
  // by the education.bump_study_streak() DB trigger on study_session insert,
  // so it reflects activity across every study mode (flashcards, fast fire...).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await studyService.getStreak();
      if (!cancelled && !res.error) setStreak(res.data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // VISION §15 (WP3 gap 6) — account-level export: every live deck the learner
  // can list, with full cards, as one lossless JSON file. Loud on partial
  // failure — a deck that fails to load is reported, never silently dropped.
  const exportLibrary = async (): Promise<void> => {
    if (exportingLibrary) return;
    setExportingLibrary(true);
    try {
      // Export is the one job that reads the whole library, on request.
      const listed = await fcService.listSets();
      if (listed.error) {
        toast.error(`Export failed — ${listed.error}`);
        return;
      }
      const sets: FcSetRow[] = listed.data ?? [];
      if (sets.length === 0) {
        toast.error("There are no decks to export yet.");
        return;
      }
      const decks: { set: FcSetRow; cards: CardWithDetails[] }[] = [];
      const failed: string[] = [];
      for (const set of sets) {
        const res = await fcService.getSetWithCards(set.id);
        if (res.data) decks.push(res.data);
        else failed.push(set.name);
      }
      if (decks.length === 0) {
        toast.error("Export failed — no deck could be loaded.");
        return;
      }
      downloadTextFile(
        `flashcard_library_${new Date().toISOString().slice(0, 10)}.json`,
        "application/json",
        buildLibraryJson(decks),
      );
      if (failed.length > 0) {
        toast.error(
          `Exported ${decks.length} decks — ${failed.length} failed to load: ${failed.join(", ")}`,
        );
      } else {
        toast.success(`Exported ${decks.length} decks`);
      }
    } finally {
      setExportingLibrary(false);
    }
  };

  const goTo = (path: string) => {
    if (isPending) return;
    startTransition(() => router.push(path));
  };

  // Page actions (page-pass 2026-09-27): "Review due" is the one labelled
  // primary action; everything else is ONE labelled "More" menu. Navigation
  // is a real link (new tab, prefetch, the route's loading state at once).
  const headerActions: EducationToolAction[] = [
    {
      icon: "Flame",
      label: "Drill weak areas",
      href: `${EDU_BASE}/weak-areas`,
    },
    { icon: "TrendingUp", label: "Progress", href: `${EDU_BASE}/progress` },
    {
      icon: "FileSearch",
      label: "New deck from a document",
      href: `${EDU_BASE}/new/from-source`,
    },
    { icon: "Upload", label: "Import decks", href: `${EDU_BASE}/new/import` },
    {
      icon: "Download",
      label: exportingLibrary ? "Exporting library…" : "Export library",
      disabled: exportingLibrary,
      onPress: () => {
        if (!exportingLibrary) void exportLibrary();
      },
    },
    {
      // THE DOOR LAW — /education/offline was reachable only by the service
      // worker serving it on a failed navigation.
      icon: "CloudOff",
      label: "Downloaded & offline",
      href: "/education/offline",
    },
    {
      // THE DOOR LAW — every AI step in flashcards is a Mandate the learner
      // may re-point at their own agent.
      icon: INTELLIGENCE_ICON_NAME,
      label: "Flashcards intelligence",
      href: featureIntelligenceHref("flashcards"),
    },
    {
      icon: "CalendarClock",
      label: "Review due",
      href: `${EDU_BASE}/review`,
      primary: true,
    },
  ];

  const createButton = (
    <Button
      size="sm"
      className="h-11 lg:h-7"
      onClick={() => goTo(`${EDU_BASE}/new`)}
    >
      <Plus className="h-4 w-4" />
      <span className="max-sm:sr-only">Create deck</span>
    </Button>
  );
  // The streak rides the scope-tab row, beside Create deck — never a row of
  // its own.
  const tabRowActions = (
    <>
      <StreakChip streak={streak} />
      {createButton}
    </>
  );
  const surface =
    userId
      ? {
          surfaceName: SURFACE_NAME,
          getScope: (list: EntityListSurfaceController<FlashcardSetListRow>) =>
            buildDeckScope({
              list,
              userId,
              folders: folders.map((f) => ({ id: f.id, name: f.name })),
              folderName,
              streak,
            }),
          getWriteHandlers: (
            list: EntityListSurfaceController<FlashcardSetListRow>,
          ) =>
            buildDeckWriteHandlers({
              list,
              userId,
              folders: folders.map((f) => ({ id: f.id, name: f.name })),
            }),
        }
      : undefined;

  return (
    <>
      <EducationToolHeader
        title="Flashcard Studio"
        actions={actionLayout === "header" ? headerActions : undefined}
      />
      {config ? (
        <EntityListPage
          config={config}
          // The education layout already starts every route below the header.
          clearsShellHeader={false}
          headerActions={tabRowActions}
          emptyAction={createButton}
          notice={
            actionLayout === "page" ? (
              <QuickActions
                goTo={goTo}
                isPending={isPending}
                exporting={exportingLibrary}
                onExport={() => {
                  if (!exportingLibrary) void exportLibrary();
                }}
              />
            ) : undefined
          }
          surface={surface}
        />
      ) : authReady && !userId ? (
        // A signed-out visitor has no library: say so and offer the way in,
        // never an endless loader.
        <div className="flex h-full items-center justify-center px-4">
          <div className="max-w-sm rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Sign in to see your flashcard decks and create new ones.
            </p>
            <Button asChild className="mt-4" size="sm">
              <Link href={loginHref}>Sign in</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center">
          <SuspenseLoader message="Loading your flashcard decks" />
        </div>
      )}
    </>
  );
}

/** The `/education/flashcards-2` comparison concept: actions as a panel. */
function QuickActions({
  goTo,
  isPending,
  exporting,
  onExport,
}: {
  goTo: (path: string) => void;
  isPending: boolean;
  exporting: boolean;
  onExport: () => void;
}) {
  const item = (
    label: string,
    Icon: ComponentType<{ className?: string }>,
    onClick: () => void,
    disabled = isPending,
  ) => (
    <Button
      key={label}
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className="h-auto min-h-11 w-full justify-start gap-2 whitespace-normal px-3 py-2 sm:min-h-10"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-left leading-tight">{label}</span>
    </Button>
  );
  return (
    <section
      aria-label="Flashcard actions"
      className="matrx-touch-targets rounded-xl border border-border bg-card/80 p-3"
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {item("Review due", CalendarClock, () => goTo(`${EDU_BASE}/review`))}
        {item("Drill weak areas", Flame, () => goTo(`${EDU_BASE}/weak-areas`))}
        {item("Progress", TrendingUp, () => goTo(`${EDU_BASE}/progress`))}
        {item("From a document", FileSearch, () =>
          goTo(`${EDU_BASE}/new/from-source`),
        )}
        {item("Import decks", Upload, () => goTo(`${EDU_BASE}/new/import`))}
        {item("Export library", exporting ? Loader2 : Download, onExport, exporting)}
        {item("Downloaded & offline", CloudOff, () => goTo("/education/offline"))}
        {item("Flashcards intelligence", INTELLIGENCE_ICON, () =>
          goTo(featureIntelligenceHref("flashcards")),
        )}
      </div>
    </section>
  );
}
