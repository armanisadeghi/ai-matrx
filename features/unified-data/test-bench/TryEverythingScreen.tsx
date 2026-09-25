"use client";

// features/unified-data/test-bench/TryEverythingScreen.tsx
//
// "TRY EVERYTHING" — ONE PAGE THAT PUTS EVERY PART OF THE RECORD STORE IN FRONT
// OF ONE PERSON, IN THE ORGANIZATION THEY ARE ALREADY IN.
//
// It is not a demo and it holds no sample data. Every section below mounts the
// SAME component `/data-v2` mounts, against the SAME doors, in the SAME
// organization — so anything that happens here really happened, and anything
// that refuses really refuses. The only thing this file adds is the order, the
// one-line explanations and, for the parts that are NOT finished, a note that
// says what exists today and what it is waiting for, by name.
//
// WHY THE WHOLE SCREEN IS IN ONE FILE. `pnpm check:campaign-entry-points` makes
// every file that imports `@ai-matrx/records*` a registered `runtime` entry
// that must read the campaign switch itself. Splitting twelve sections into
// twelve files would mean twelve registrations and twelve copies of the same
// gate; keeping every store-touching line here means ONE registration and ONE
// switch read, and the frames, labels and notes live next door in
// `TestBenchChrome.tsx`, which reaches nothing.
//
// THE STATUS STRIP READS, IT DOES NOT ASSERT. Six facts, each from its own
// source, each with its own sentence for "we could not read this". There is no
// number on this page that was not read from the live system this minute.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";

// The versions THIS DEPLOYMENT resolved at build time. `package.json` is the
// only honest source: the app's own dependency line says `latest`, which is a
// request, not an answer, and the lockfile is what the bundle actually carries.
import recordsPkg from "@ai-matrx/records/package.json";
import recordsUiPkg from "@ai-matrx/records-ui/package.json";
import { FIELD_KINDS, type Table } from "@ai-matrx/records";
import { useRecords, useRecordsClient, useTables } from "@ai-matrx/records/react";
import {
    ActionInbox,
    BookingSlots,
    ChecklistsPanel,
    CustomFieldsSection,
    DashboardCanvas,
    EnrichPanel,
    FieldEditor,
    FormBuilder,
    FormsPanel,
    HistoryPanel,
    laneFor,
    NotifyRuleEditor,
    PortalsPanel,
    RecordsMount,
    ShareControl,
    TablesHome,
    ViewSwitcher,
    personActor,
    recordsDataSource,
    refusalLineForAPerson,
    rowNameIn,
    tableName,
} from "@ai-matrx/records-ui";

import { Button } from "@/components/ui/button";
// THE PLATFORM'S ONE RICH DOCUMENT. A rendered document is a body of text with
// print and save-as-PDF on it, which is exactly what this component is and what
// every other document surface in the app already mounts. A second renderer
// here would be the parallel layer the canvas ruling forbids.
import { RichDocument } from "@/features/rich-document/RichDocument";
import { recordStoreShare } from "@/features/sharing/components/RecordStoreShareSurface";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { getOrganizationMembers } from "@/features/organizations/service";
import { searchPartiesByName } from "@/features/crm/service";
import {
    fetchKnobWriteDoor,
    writeKnobOverrideThroughDoor,
    type KnobWriteDoor,
} from "@/lib/scoped-config/service";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { knobChoiceLabel } from "@/lib/scoped-config/choices";
import { useKnobChoices } from "@/lib/scoped-config/useKnobChoices";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationName } from "@/features/scopes/redux/selectors/active-context";
import { createClient } from "@/utils/supabase/client";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";

import {
    Aside,
    NotBuiltYet,
    Refusal,
    Section,
    StatusFact,
    TryIt,
    sectionAnchor,
    type Capability,
} from "./TestBenchChrome";
import type { RouteFact, RoutesInThisBuild } from "./routeFacts";
import { organizationSavedViews } from "./savedViewsPort";

/** The organization setting section 2 flips, at its one registry address. */
const MEMBER_VISIBILITY = { feature: "custom", key: "member_default_visibility" } as const;
const MEMBER_VISIBILITY_FULL_KEY = `${MEMBER_VISIBILITY.feature}.${MEMBER_VISIBILITY.key}`;

// THE WORDS FOR THIS SETTING'S CHOICES ARE NOT IN THIS FILE, and no screen's
// words for any setting ever are (lane FRONT-DOOR, 2026-09-21; VERIFIER-8
// MEDIUM-2). This file used to carry a two-row list of them, which had invented
// a value the registry does not admit (`organization`) and missed the one it
// does (`all_records`) — so the header's lookup missed and printed
// `Set to "all_records", which this screen has no words for` at a person.
// `useKnobChoices` reads them from `platform.feature_knob` through the same
// knob door the write below uses.

// A SMALL COUNT SAID IN WORDS, NEVER A LITERAL. The number of field kinds the
// store offers changes as the package adds them (sixteen, then nineteen); this
// reads `FIELD_KINDS.length` every time rather than a number typed into a
// sentence, so the sentence can never fall behind the store again.
const SMALL_NUMBER_WORDS = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];
function wordForCount(n: number): string {
    return SMALL_NUMBER_WORDS[n] ?? String(n);
}

/** The names the rail shows. The section number is the anchor. */
const CONTENTS: ReadonlyArray<string> = [
    "Tables and grid",
    "Sharing and access",
    "Relations and rollups",
    "Custom fields on a CRM contact",
    "Forms",
    "Assignments and approvals",
    "Agent",
    "History and undo",
    "Dashboards",
    "Outsider portal",
    "Documents",
    "Notifications and digests",
    "Checklists and SOP runs",
    "Booking a time",
    "A column a model fills in",
    "The pipeline board",
];

/**
 * DOES THIS DEPLOYMENT HAVE THIS DOOR, AND DOES IT ANSWER?
 *
 * THE CLASS THIS FIXES. Until 2026-09-20 three sections of this page carried
 * sentences somebody had typed about what the build could not do — a form
 * builder that "cannot finish making that table", a dashboard canvas with "the
 * same red box", a portal with "no portal address to give anybody". A verifier
 * pressed all three and every one of them worked, on a build whose own status
 * line said which package versions it had resolved. A note that outlives the
 * defect it describes is worse than no note: "a person who believes the page
 * will not press the buttons that work."
 *
 * So a section does not hold an opinion about the store. It asks TWO things,
 * both live, and renders whatever comes back:
 *   1. does the `@ai-matrx/records` client THIS deployment resolved carry the
 *      calls the panel below makes — the same package the status strip names;
 *   2. does the door actually answer, rather than refuse, right now.
 *
 * `there: null` is a real third answer — asked, could not tell — and it never
 * gets reported as absence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 THE SECOND VERSION OF THE SAME LIE, AND THE TWO RULES THAT END IT
 * (lane FRONT-DOOR, 2026-09-21; the defect is VERIFIER-8 HIGH-1).
 *
 * Section 16 printed, in the owner's own organization:
 *
 *     Not built yet
 *     … The door is here but it refused just now — You do not have access to
 *     this table. Ask whoever owns it to share the table … with you.
 *     Waiting on: the screens package this deployment installs carrying the
 *     pipeline doors.
 *
 * Every one of those three sentences was false. All seven pipeline doors are
 * installed and granted; asked about a REAL table of that organization,
 * `custom.pipeline_read` answers correctly. The page had asked it about the
 * ZERO UUID, the store refused a table that does not exist — which is the store
 * being RIGHT — and the page printed that refusal as a fact about the owner's
 * own store, under the word "Not built yet".
 *
 *   RULE 1 — A PROBE ASKS ABOUT A REAL OBJECT OR IT DOES NOT ASK.
 *   There is no such thing as a placeholder identifier here. A section with
 *   nothing real to ask about passes `cannotRun` and the page says "could not
 *   check — <why>", which is the truth and is also actionable.
 *
 *   RULE 2 — A REFUSAL IS AN ANSWER ABOUT THE QUESTION, NEVER ABOUT THE
 *   FEATURE. A door that refuses is a door that is INSTALLED AND ANSWERING, so
 *   a refusal can never be evidence of absence. It becomes "could not check",
 *   with the store's own sentence quoted as the thing that got in the way.
 *
 * The ONLY `there: false` left on this page is the one fact this screen can
 * actually establish: the package this deployment resolved does not carry the
 * call at all. Guard: `pnpm check:failed-check-is-not-a-fact` (+ `:self-test`,
 * which plants these exact shipped bytes and requires a RED).
 */
function useDoor({
    needs,
    ask,
    cannotRun,
    whenItAnswers,
    whatWouldMakeItAppear,
}: {
    /** The client calls the panel makes. A name missing here means this deployment predates it. */
    needs: readonly string[];
    /** One cheap READ through those doors, about a REAL object. Never a placeholder id. */
    ask: (client: ReturnType<typeof useRecordsClient>) => Promise<{ ok: boolean; error?: unknown }>;
    /**
     * WHY THIS PROBE CANNOT BE ASKED AT ALL — one sentence, or null when it can.
     * Non-null and nothing is asked and nothing is claimed: RULE 1 above.
     */
    cannotRun?: string | null;
    /** The sentence when it is here and answering. */
    whenItAnswers: string;
    /** The one thing that would make it appear, when it genuinely is not here. */
    whatWouldMakeItAppear: string;
}): Capability {
    const client = useRecordsClient();
    const [capability, setCapability] = useState<Capability>({
        there: null,
        because: "Checking whether this deployment has it…",
    });

    useEffect(() => {
        let cancelled = false;
        const holder = client as unknown as Record<string, unknown>;
        const absent = needs.filter((name) => typeof holder[name] !== "function");
        if (absent.length > 0) {
            // THE ONE HONEST ABSENCE. Not "this is not built" about the platform —
            // "the package these bytes resolved does not carry the call", which is a
            // fact about this deployment and is the only one this screen can prove.
            setCapability({
                there: false,
                because:
                    `The record store package this deployment resolved (${recordsPkg.version}) does not carry ` +
                    `${absent.length === 1 ? "the call" : "the calls"} this needs, so the panel below cannot work here.`,
                whatWouldMakeItAppear,
            });
            return;
        }
        if (cannotRun) {
            // RULE 1. Nothing real to ask about, so nothing is asked and nothing is claimed.
            setCapability({ there: null, settled: true, because: `We could not check this one — ${cannotRun}` });
            return;
        }
        void Promise.resolve(ask(client))
            .then((answered) => {
                if (cancelled) return;
                if (answered.ok) {
                    setCapability({ there: true, because: whenItAnswers });
                    return;
                }
                // RULE 2. A door that refused is a door that ANSWERED. This is what got in
                // the way of the check — never a verdict on the feature, and never printed
                // as though the store had said it about this person's own organization.
                setCapability({
                    there: null,
                    settled: true,
                    because:
                        `We could not check this one — the door is installed and answering, and the question we ` +
                        `asked it came back refused: ${refusalLineForAPerson(
                            answered.error as Parameters<typeof refusalLineForAPerson>[0],
                        )} That is an answer about the question, not about whether this part is built.`,
                });
            })
            .catch((thrown: unknown) => {
                if (cancelled) return;
                // ASKED AND COULD NOT TELL. Never an absence.
                setCapability({
                    there: null,
                    settled: true,
                    because: `We could not check this one — ${thrown instanceof Error ? thrown.message : String(thrown)}`,
                });
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, needs.join(","), cannotRun, whenItAnswers, whatWouldMakeItAppear]);

    return capability;
}

/**
 * DOES THIS BUILD SERVE THAT ADDRESS? — the App Router's own directory tree,
 * read on the server by `routesInThisBuild` and handed down. A page file is the
 * only thing that decides whether an address exists, so it is the only thing
 * this page is allowed to say it from.
 */
function routeCapability(fact: RouteFact, whenItIsThere: string, whatWouldMakeItAppear: string): Capability {
    if (fact.there === null) {
        return {
            there: null,
            settled: true,
            because: `We could not read this build's pages, so we cannot say whether ${fact.path} is served here.`,
        };
    }
    return fact.there
        ? { there: true, because: `${whenItIsThere} The address is ${fact.path}.` }
        : { there: false, because: `This build serves no page at ${fact.path}.`, whatWouldMakeItAppear };
}

export default function TryEverythingScreen({ routes }: { routes: RoutesInThisBuild }) {
    const router = useRouter();
    const userId = useAppSelector(selectUserId);
    const organizationName = useAppSelector(selectActiveOrganizationName);
    const { organizationId, organizationState } = useOrganizationRequired();

    // ONE SWITCH, the same one `/data-v2` reads: does THIS organization keep
    // its data in the record store?
    const campaign = useUnifiedDataCampaign({
        organizationId,
        organizationState,
        storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.enabled(organization),
    });

    /** The membership port the sibling pages bind — a person field must offer people. */
    const members = useCallback(async () => {
        if (!organizationId) return [];
        const roster = await getOrganizationMembers(organizationId);
        return roster.map((member) => ({
            userId: member.userId,
            name: member.user?.displayName ?? null,
            email: member.user?.email ?? null,
            avatarUrl: member.user?.avatarUrl ?? null,
        }));
    }, [organizationId]);

    if (organizationState !== "ready") {
        return <OrganizationContextNotice state={organizationState} what="the record store" />;
    }
    if (campaign.on === null) return null;
    if (!campaign.on) {
        return (
            <div className="mx-auto max-w-3xl">
                <p className="text-sm leading-relaxed opacity-80">{campaign.because}</p>
            </div>
        );
    }

    return (
        <RecordsMount
            letTheStoreDecideRights
            config={{
                dataSource: recordsDataSource(createClient()),
                actor: personActor(userId),
                organizationId: organizationId!,
            }}
            host={{
                Link,
                density: "condensed",
                members,
                share: recordStoreShare,
                // THE SAVED-VIEW PORT, BOUND. Section 12's editor used to print
                // an instruction to go and edit source code; this app has those
                // views, so it hands them over instead.
                savedViews: () => organizationSavedViews(organizationId!),
            }}
        >
            <Bench
                organizationId={organizationId!}
                organizationName={organizationName ?? null}
                userId={userId ?? null}
                routes={routes}
                onOpenTable={(tableId) => router.push(`/data-v2/${tableId}`)}
            />
        </RecordsMount>
    );
}

/**
 * Everything below the mount. Split from the component above only because the
 * store's hooks need the provider that component renders — a hook cannot be
 * called above its own provider.
 */
function Bench({
    organizationId,
    organizationName,
    userId,
    routes,
    onOpenTable,
}: {
    organizationId: string;
    organizationName: string | null;
    userId: string | null;
    routes: RoutesInThisBuild;
    onOpenTable: (tableId: string) => void;
}) {
    const tables = useTables();
    const [workingTableId, setWorkingTableId] = useState<string | null>(null);

    // The working table: whichever the person picked, else the first one the
    // store returned, so every section below has something real to act on the
    // moment there IS a table. Never a fabricated id.
    // THE PERSON'S OWN TABLES, never the package's housekeeping ones. The
    // first walk defaulted the whole page to a table called "Dashboards" that
    // `DashboardCanvas` had made for itself two minutes earlier, and then said
    // truthfully that it had no records. A table in the `app` lane is the
    // product's own bookkeeping; it is not what "the table these sections work
    // on" means.
    const rows: Table[] = useMemo(
        () => (tables.data ?? []).filter((t) => laneFor(t) !== "app" && laneFor(t) !== "system"),
        [tables.data],
    );
    const workingTable = useMemo(
        () => rows.find((t) => t.id === workingTableId) ?? rows[0] ?? null,
        [rows, workingTableId],
    );

    // ── WHAT THIS DEPLOYMENT CAN ACTUALLY DO, asked of the deployment ──────
    // Every verdict below this line is one of these answers. None of them is a
    // sentence anybody typed about a version.
    const formsDoor = useDoor({
        needs: ["forms", "formDeclare", "anonPublish"],
        ask: (client) => client.forms({}),
        whenItAnswers:
            "The form builder works on this deployment: it writes the form, publishes it, and hands you the " +
            "link a stranger answers — all through the same doors the panel below calls.",
        whatWouldMakeItAppear: "a newer @ai-matrx/records in this deployment, carrying the forms calls.",
    });
    const dashboardsDoor = useDoor({
        needs: ["dashboards", "dashboardDeclare", "dashboardRun"],
        ask: (client) => client.dashboards({}),
        whenItAnswers:
            "The dashboard canvas works on this deployment: it keeps your charts, and every number in them " +
            "is the store's own answer over your real records.",
        whatWouldMakeItAppear: "a newer @ai-matrx/records in this deployment, carrying the dashboard calls.",
    });
    const portalDoors = useDoor({
        needs: ["portals", "portalCard", "portalInvite", "portalRevoke"],
        ask: (client) => client.portals(),
        whenItAnswers:
            "The portal doors answer this browser: you can open a portal, invite a client to it, see what " +
            "she will see, and take her way in away again.",
        whatWouldMakeItAppear: "a newer @ai-matrx/records in this deployment, carrying the portal calls.",
    });
    const checklistDoors = useDoor({
        needs: ["checklistTemplates", "checklistRuns", "checklistRun", "checklistStepComplete"],
        ask: (client) => client.checklistTemplates({}),
        whenItAnswers:
            "The checklist doors answer this browser: a checklist can be written whole, run on a record, and " +
            "each step ticked off with whatever it asks for — refused by name while the step before it is open.",
        whatWouldMakeItAppear: "a newer @ai-matrx/records in this deployment, carrying the checklist calls.",
    });
    const bookingDoors = useDoor({
        needs: ["bookings", "anonPublish"],
        ask: (client) => client.bookings({}),
        whenItAnswers:
            "The booking doors answer this browser: your booking pages, what is coming up, what somebody is " +
            "holding right now, and the link you send.",
        whatWouldMakeItAppear: "a newer @ai-matrx/records in this deployment, carrying the bookings call.",
    });
    const enrichDoors = useDoor({
        needs: ["enrichments", "enrichDeclare", "enrichCells", "enrichPin"],
        ask: (client) => client.enrichments({}),
        whenItAnswers:
            "The enrichment doors answer this browser: a column a model keeps filled in, with who filled each " +
            "cell, when, what it read and how sure it was — and your own answer able to take it back.",
        whatWouldMakeItAppear: "a newer @ai-matrx/records in this deployment, carrying the enrichment calls.",
    });
    // THE ONE PROBE ON THIS PAGE THAT NEEDS A TABLE, AND THE ONLY ONE THAT EVER
    // FABRICATED ONE. Every other probe above is a whole-organization list
    // (`forms({})`, `dashboards({})`, `portals()`, `checklistTemplates({})`,
    // `bookings({})`, `enrichments({})`) and asks about nothing that has to
    // exist. This one asks about a TABLE, and it used to pass the zero UUID
    // when there wasn't one — see `useDoor`'s header for what that printed.
    // It now asks about the working table, which is a real table of this
    // organization read through the store's own list door, and says so plainly
    // when the organization has no table for it to ask about yet.
    const pipelineDoors = useDoor({
        needs: ["pipelineRead", "pipelineBoard", "pipelineTransitionRefusal", "pipelineMove"],
        cannotRun: workingTable
            ? null
            : tables.loading
              ? "we are still reading this organization's tables, so there is no table to ask the board about yet."
              : "this organization has no table of its own yet, so there is nothing for the board to be about. " +
                "Make one in section 1 and this checks itself.",
        ask: (client) => client.pipelineRead({ table_id: workingTable!.id }),
        whenItAnswers:
            "The pipeline doors answer this browser: the board asks the store before every drag, and a move the " +
            "rules refuse snaps back carrying the store's own sentence.",
        whatWouldMakeItAppear: "a newer @ai-matrx/records in this deployment, carrying the pipeline calls.",
    });
    const portalRoute = routeCapability(
        routes.portal,
        "This build serves the client portal.",
        "a public route for the portal to be mounted on.",
    );
    const publicFormRoute = routeCapability(
        routes.publicForm,
        "This build serves the page a stranger answers a form on, with no account.",
        "a public route for a published form to be answered on.",
    );

    return (
        <div className="mx-auto max-w-3xl space-y-3 pb-24">
            <StatusStrip
                organizationId={organizationId}
                organizationName={organizationName}
                userId={userId}
                tableCount={tables.data?.length ?? null}
                tablesError={tables.error ? refusalLineForAPerson(tables.error) : null}
            />

            <ContentsRail />

            <WorkingTableBar
                tables={rows}
                loading={tables.loading}
                error={tables.error ? refusalLineForAPerson(tables.error) : null}
                selectedId={workingTable?.id ?? null}
                onSelect={setWorkingTableId}
                onOpenTable={onOpenTable}
            />

            {/* 1 — TABLES AND GRID */}
            <Section
                n={1}
                title={CONTENTS[0]}
                state="real"
                defaultOpen
                what={`A table here is a real table in this organization's one record store: you name it, give it columns of any of the ${wordForCount(FIELD_KINDS.length)} kinds, and type straight into the grid. Opening one gives you the grid, the board and the calendar of the same records.`}
            >
                <TryIt hint="this makes a real table in this organization">
                    <TablesHome onOpenTable={onOpenTable} />
                </TryIt>
                <Aside>
                    Open a table and the screen above the grid carries the saved views (Grid, Board,
                    Calendar, Cards), the plus at the end of the column headers that adds a column, and
                    double-click on any cell to edit it in place.
                </Aside>
            </Section>

            {/* 2 — SHARING AND ACCESS */}
            <Section
                n={2}
                title={CONTENTS[1]}
                state="real"
                defaultOpen
                what="Every record and every table can be handed to a colleague at one of four levels — viewer, commenter, editor, admin — and the Access tab answers, in sentences, who can open it and why. One organization setting decides what plain membership alone shows."
            >
                <ShareTry table={workingTable} organizationId={organizationId} />
                <MemberVisibilityControl organizationId={organizationId} userId={userId} />
            </Section>

            {/* 3 — RELATIONS AND ROLLUPS */}
            <Section
                n={3}
                title={CONTENTS[2]}
                state="real"
                what="A column can point at a record in another table, and a second column can total, count or average whatever the first one points at. Both are declared in the same panel that adds any other column."
            >
                <NeedsTable table={workingTable}>
                    {(table) => (
                        <TryIt hint={`adds a real column to ${tableName(table)}`}>
                            <div className="rounded-md border border-border p-3">
                                <FieldEditor tableId={table.id} />
                            </div>
                            <Aside>
                                Pick <span className="font-medium">Points at another record</span> for the
                                relation, then add a second column of kind{" "}
                                <span className="font-medium">Total of linked records</span> and choose the
                                relation it reads through. A relation that holds one record at a time has
                                nothing to total, and the panel says so rather than offering a button that
                                fails.
                            </Aside>
                        </TryIt>
                    )}
                </NeedsTable>
            </Section>

            {/* 4 — CUSTOM FIELDS ON A STANDARD BUSINESS TABLE */}
            <Section
                n={4}
                title={CONTENTS[3]}
                state="real"
                what="The same store extends tables you did not create. A CRM contact is a standard platform record, and this section adds a column to it — for this organization only, without a migration and without touching anybody else's CRM."
            >
                <CrmContactTry organizationId={organizationId} />
            </Section>

            {/* 5 — FORMS */}
            <Section
                n={5}
                title={CONTENTS[4]}
                capability={[formsDoor, publicFormRoute]}
                what="A form is a view on one of your tables: you pick the questions, publish it, and a stranger with the link answers without an account. Their answer arrives as a record in the table, stamped with where it came from."
            >
                <NeedsTable table={workingTable}>
                    {(table) => (
                        <>
                            <TryIt hint={`the forms already published on ${tableName(table)}`}>
                                <div className="rounded-md border border-border p-3">
                                    <FormsPanel tableId={table.id} />
                                </div>
                            </TryIt>
                            <WritesItsOwnTable
                                what="the form builder"
                                whatHappens={
                                    "It keeps your forms in a table of its own called Forms, and it makes that " +
                                    "table the first time it runs — in this organization, under \"Kept by the app\"."
                                }
                            >
                                <FormBuilder tableId={table.id} />
                            </WritesItsOwnTable>
                            <Aside>
                                Write the questions, press Save, then press Publish — the link appears beside it and
                                anybody who has it can answer without an account. Section 7's agent can write the
                                whole form from one sentence instead, and it shows up in the panel above.
                            </Aside>
                        </>
                    )}
                </NeedsTable>
            </Section>

            {/* 6 — ASSIGNMENTS AND APPROVALS */}
            <Section
                n={6}
                title={CONTENTS[5]}
                state="real"
                defaultOpen
                what="One queue holds everything waiting on you: a record somebody assigned you, a change somebody asked you to approve, and a column an agent wants to add. Deciding here applies the change through the store's own doors, as you."
            >
                <TryIt hint="deciding here really applies the change">
                    <div className="rounded-md border border-border">
                        <ActionInbox
                            className="max-h-80"
                            onOpenRecord={(recordId, tableId) =>
                                onOpenTable(`${tableId}?record=${recordId}`)
                            }
                        />
                    </div>
                </TryIt>
                <Aside>
                    To put something in it: open a record, assign it to a colleague (that also gives them
                    editor access, so nobody is handed a row they are refused), or ask an agent in section 7
                    to change a table it did not create.
                </Aside>
            </Section>

            {/* 7 — AGENT */}
            <Section
                n={7}
                title={CONTENTS[6]}
                state="partly"
                what="In an organization whose store is on, an agent made here arrives with the Records tool already on. Ask it for a table and it builds one; ask it to change a table it did not make and it has to ask a person first."
            >
                <AgentTry organizationId={organizationId} />
            </Section>

            {/* 8 — HISTORY AND UNDO */}
            <Section
                n={8}
                title={CONTENTS[7]}
                state="real"
                what="Every value ever written is kept with who wrote it, when, and — when a rule produced it — which version of that rule. A change can be put back."
            >
                <NeedsTable table={workingTable}>
                    {(table) => <HistoryTry table={table} />}
                </NeedsTable>
            </Section>

            {/* 9 — DASHBOARDS */}
            <Section
                n={9}
                title={CONTENTS[8]}
                capability={dashboardsDoor}
                what="A chart over your own records: group by a column, count or total another, and every number is the store's own answer rather than a copy kept somewhere else."
            >
                <NeedsTable table={workingTable}>
                    {(table) => (
                        <>
                            <WritesItsOwnTable
                                what="the dashboard canvas"
                                whatHappens={
                                    "It keeps your charts in a table of its own called Dashboards, and it makes " +
                                    "that table the first time it runs — in this organization, under \"Kept by the app\"."
                                }
                            >
                                <DashboardCanvas tableId={table.id} />
                            </WritesItsOwnTable>
                            <Aside>
                                A dashboard belongs to the one table it is about, so it lives here rather than on a
                                page of its own — charts from two different tables cannot yet sit side by side.
                            </Aside>
                        </>
                    )}
                </NeedsTable>
            </Section>

            {/* 10 — OUTSIDER PORTAL */}
            <Section
                n={10}
                title={CONTENTS[9]}
                capability={[portalRoute, portalDoors]}
                what="A client, vendor or patient signs in and sees only their own jobs and invoices, decided by the same sharing you already use rather than by a query somebody had to write."
            >
                <NeedsTable table={workingTable}>
                    {(table) => (
                        <TryIt hint="this opens a real portal and invites a real person to it">
                            <div className="rounded-md border border-border p-3">
                                <PortalsPanel tableId={table.id} />
                            </div>
                        </TryIt>
                    )}
                </NeedsTable>
                <Aside>
                    The panel above says in plain English how a client gets her address, what she will see when
                    she opens it, and how to take her way in away again. Section 2's Access tab answers the same
                    question for people inside your organization.
                </Aside>
            </Section>

            {/* 11 — DOCUMENTS */}
            <Section
                n={11}
                title={CONTENTS[10]}
                state="partly"
                what="Turn a record into a document — a proposal, a quote, a letter — by writing the wording once with the table's columns dropped into it, then rendering it for any record."
            >
                <NeedsTable table={workingTable}>
                    {(table) => <DocumentsTry table={table} organizationId={organizationId} />}
                </NeedsTable>
            </Section>

            {/* 12 — NOTIFICATIONS AND DIGESTS */}
            <Section
                n={12}
                title={CONTENTS[11]}
                state="partly"
                what="Being told when something happens: a message the moment a record matches what you care about, or a summary on a schedule. What counts as worth telling you is a rule over a saved view, in English."
            >
                <NeedsTable table={workingTable}>
                    {(table) => (
                        <>
                            <TryIt hint={`writes a real subscription on ${tableName(table)}`}>
                                <div className="rounded-md border border-border p-3">
                                    <NotifyRuleEditor tableId={table.id} />
                                </div>
                            </TryIt>
                            <Aside>
                                A form published in section 5 already subscribes whoever asked for it, so a new
                                response shows up in the bell at the top of the window.
                            </Aside>
                            <NotificationsTry table={table} organizationId={organizationId} />
                        </>
                    )}
                </NeedsTable>
            </Section>

            {/* 13 — CHECKLISTS AND SOP RUNS */}
            <Section
                n={13}
                title={CONTENTS[12]}
                capability={checklistDoors}
                what="Write down a process once — the steps, whose each one is, how many days in it is due, what it waits for and what it asks for — and every new record it is about starts a run of it on its own. A step is ordinary work, so it lands in its owner's inbox beside everything else waiting on her."
            >
                <NeedsTable table={workingTable}>
                    {(table) => (
                        <TryIt hint={`writes a real checklist about ${tableName(table)}`}>
                            <div className="rounded-md border border-border p-3">
                                <ChecklistsPanel tableId={table.id} />
                            </div>
                            <Aside>
                                Press <span className="font-medium">Write one</span> and type the steps as plain
                                rows. The store judges the whole checklist while you type — a step that waits for
                                one below it is refused in a sentence before you can save. Starting a run is on the
                                record itself: open a record from the grid in section 1 and the checklists about
                                that table are offered under it.
                            </Aside>
                        </TryIt>
                    )}
                </NeedsTable>
            </Section>

            {/* 14 — BOOKING A TIME */}
            <Section
                n={14}
                title={CONTENTS[13]}
                capability={bookingDoors}
                what="Let somebody with no account take a half hour of your time. The page offers only the times you are free, the slot is held the moment they pick it and released if they wander off, and the appointment arrives as an ordinary record in one of your tables."
            >
                <NeedsTable table={workingTable}>
                    {(table) => (
                        <TryIt hint={`the booking pages already open on ${tableName(table)}`}>
                            <div className="rounded-md border border-border p-3">
                                <BookingSlots tableId={table.id} />
                            </div>
                            <Aside>
                                The panel above is the owner&apos;s side: what is coming up, what somebody is
                                holding right now, the link, and opening or closing the page. The page a visitor
                                sees is the link itself — nothing here works out what is on offer, because a
                                browser that decided that could hold a time you never offered.
                            </Aside>
                        </TryIt>
                    )}
                </NeedsTable>
            </Section>

            {/* 15 — A COLUMN A MODEL FILLS IN */}
            <Section
                n={15}
                title={CONTENTS[14]}
                capability={enrichDoors}
                what="A column a model keeps filled in — each company's industry, each contact's job title — and every cell says so on its face: who filled it, when, what it read, how sure it was and what it nearly said instead. Type over one and it is yours; the model stops touching it."
            >
                <NeedsTable table={workingTable}>
                    {(table) => (
                        <TryIt hint={`this really runs a model over ${tableName(table)} and really costs money`}>
                            <div className="rounded-md border border-border p-3">
                                <EnrichPanel tableId={table.id} />
                            </div>
                            <Aside>
                                Back in the grid in section 1, every cell the model owns carries a small badge;
                                hovering it opens what it read, how sure it was, the answers it nearly gave, and
                                the control that takes the cell back. A value past its freshness date says
                                <span className="font-medium"> stale</span> beside the badge in words, never as a
                                colour somebody has to know the meaning of.
                            </Aside>
                        </TryIt>
                    )}
                </NeedsTable>
            </Section>

            {/* 16 — THE PIPELINE BOARD */}
            <Section
                n={16}
                title={CONTENTS[15]}
                capability={pipelineDoors}
                what="Deals, jobs or applicants as cards in columns you drag between — with the store judging every drag. A move your rules forbid snaps back carrying the sentence that says why, and a stage that demands a value asks for it on the card instead of sending you away."
            >
                <NeedsTable table={workingTable}>
                    {(table) => (
                        <TryIt hint={`dragging a card really moves the record in ${tableName(table)}`}>
                            <div className="rounded-md border border-border p-3">
                                {/* THE BOARD IS THE KANBAN LAYOUT OF THE SAME SAVED VIEW, never a
                                    second screen beside it — the cards are the very rows the grid
                                    draws, and the headings carry the store's own count, total and
                                    limit over every record this person may see. */}
                                <ViewSwitcher
                                    view={{
                                        name: `${tableName(table)} board`,
                                        subject: table.id,
                                        layout: "kanban",
                                    }}
                                />
                            </div>
                            <Aside>
                                A table that is not a pipeline draws the plain board instead, and says which
                                column it would group by. Making one a pipeline — the stages, their order, the
                                moves each one allows, what each demands on entry and how many cards it will hold
                                — is one sentence to the agent in section 7.
                            </Aside>
                        </TryIt>
                    )}
                </NeedsTable>
            </Section>
        </div>
    );
}

// ───────────────────────────────────────────────────────────── status strip ──

interface ServerFacts {
    status: string;
    upSince: string;
    tools: number | null;
    buildSha: string | null;
}

function StatusStrip({
    organizationId,
    organizationName,
    userId,
    tableCount,
    tablesError,
}: {
    organizationId: string;
    organizationName: string | null;
    userId: string | null;
    tableCount: number | null;
    tablesError: string | null;
}) {
    const [waiting, setWaiting] = useState<number | undefined>(undefined);
    const [waitingProblem, setWaitingProblem] = useState<string | null>(null);
    const [server, setServer] = useState<ServerFacts | undefined>(undefined);
    const [serverProblem, setServerProblem] = useState<string | null>(null);
    const [nonce, setNonce] = useState(0);

    const visibility = useEffectiveKnob(organizationId, userId, MEMBER_VISIBILITY);
    const visibilityChoices = useKnobChoices(organizationId, MEMBER_VISIBILITY, userId);

    // HOW MANY THINGS ARE WAITING ON THIS PERSON — the store's own queue, asked
    // through the package's data source so this page reaches no door the
    // package does not already own.
    useEffect(() => {
        let cancelled = false;
        setWaiting(undefined);
        setWaitingProblem(null);
        void Promise.resolve(
            recordsDataSource(createClient()).rpc(
                "work_inbox",
                { p_organization_id: organizationId, p_limit: 200 },
                { schema: "custom" },
            ),
        )
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) {
                    setWaitingProblem(`Could not read your queue — ${error.message}`);
                    return;
                }
                setWaiting(Array.isArray(data) ? data.length : 0);
            })
            // A THROWN read is still a read that failed. Without this the strip
            // would sit on "Reading…" for ever, which is the one thing a status
            // line may never do.
            .catch((error: unknown) => {
                if (cancelled) return;
                setWaitingProblem(
                    `Could not read your queue — ${error instanceof Error ? error.message : String(error)}`,
                );
            });
        return () => {
            cancelled = true;
        };
    }, [organizationId, nonce]);

    // THE DEPLOYED SERVER. `/health/detailed` gives status, uptime and tool
    // count; `/health/version` gives the deployed git SHA (`aidream/api/routers/health.py`,
    // `deployed_git_sha()`) — the server does publish a build identity, this
    // page just was not reading it. Both are read the same way: the strip
    // shows the fact or names why it could not, never a number it made up.
    useEffect(() => {
        let cancelled = false;
        setServer(undefined);
        setServerProblem(null);
        void Promise.all([
            fetch("https://server.app.matrxserver.com/health/detailed").then((response) =>
                response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)),
            ),
            fetch("https://server.app.matrxserver.com/health/version")
                .then((response) => (response.ok ? response.json() : null))
                .catch(() => null),
        ])
            .then(
                ([body, versionBody]: [
                    { status?: string; uptime_seconds?: number; components?: { tool_system?: { tool_count?: number } } },
                    { git_sha?: string } | null,
                ]) => {
                    if (cancelled) return;
                    const up = typeof body.uptime_seconds === "number" ? body.uptime_seconds : 0;
                    setServer({
                        status: body.status ?? "unknown",
                        upSince: new Date(Date.now() - up * 1000).toLocaleString(),
                        tools: body.components?.tool_system?.tool_count ?? null,
                        buildSha: versionBody?.git_sha ? versionBody.git_sha.slice(0, 7) : null,
                    });
                },
            )
            .catch((error: unknown) => {
                if (cancelled) return;
                setServerProblem(
                    `Could not reach the AI server — ${error instanceof Error ? error.message : String(error)}`,
                );
            });
        return () => {
            cancelled = true;
        };
    }, [nonce]);

    // WHAT THIS ORGANIZATION IS SET TO, IN THE REGISTRY'S OWN WORDS. Three
    // answers, never blurred: the sentence, "still reading" (`undefined`), and
    // a problem. A stored token is never pasted into any of them — a value the
    // registry does not list is a fact about the SETTING, said as one.
    const visibilitySettled = visibility !== undefined && !visibilityChoices.loading;
    const visibilityLabel = visibilityChoices.knob
        ? knobChoiceLabel(visibilityChoices.knob, visibility)
        : null;
    const visibilityWord = visibilitySettled ? (visibilityLabel ?? undefined) : undefined;
    const visibilityProblem =
        visibilityChoices.problem ??
        (visibilitySettled && visibilityLabel === null
            ? "This organization is set to a value the settings registry does not list, so there are no words for it yet. An administrator can re-set it below."
            : null);

    return (
        <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2">
                <h1 className="text-sm font-medium text-foreground">Everything the record store can do</h1>
                <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 px-2 text-xs"
                    onClick={() => setNonce((n) => n + 1)}
                >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Re-read
                </Button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <StatusFact
                    label="Organization"
                    value={organizationName ?? `Unnamed (${organizationId.slice(0, 8)})`}
                />
                <StatusFact
                    label="Record store"
                    value={
                        tablesError
                            ? undefined
                            : tableCount === null
                              ? undefined
                              : `On — ${tableCount} ${tableCount === 1 ? "table" : "tables"} you can see`
                    }
                    problem={tablesError}
                />
                <StatusFact
                    label="Membership alone shows"
                    value={visibilityWord}
                    problem={visibilityProblem}
                />
                <StatusFact
                    label="Screens this deployment serves"
                    value={`records ${recordsPkg.version} · screens ${recordsUiPkg.version}`}
                />
                <StatusFact
                    label="AI server"
                    value={
                        server
                            ? `${server.status}, up since ${server.upSince}${server.tools === null ? "" : ` · ${server.tools} tools`}${server.buildSha ? ` · build ${server.buildSha}` : ""}`
                            : undefined
                    }
                    problem={serverProblem}
                />
                <StatusFact
                    label="Waiting for you"
                    value={
                        waiting === undefined
                            ? undefined
                            : `${waiting} ${waiting === 1 ? "thing" : "things"} to decide`
                    }
                    problem={waitingProblem}
                />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Everything on this line was read from the live system when the page loaded; press
                Re-read to ask again.
            </p>
        </div>
    );
}

function ContentsRail() {
    return (
        <nav
            aria-label="The twelve parts"
            className="sticky top-[var(--shell-header-h)] z-10 -mx-1 flex flex-wrap gap-1 rounded-lg border border-border bg-card/95 px-2 py-1.5 backdrop-blur"
        >
            {CONTENTS.map((title, index) => (
                <a
                    key={title}
                    href={`#${sectionAnchor(index + 1)}`}
                    className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <span className="tabular-nums opacity-60">{index + 1}</span> {title}
                </a>
            ))}
        </nav>
    );
}

// ────────────────────────────────────────────────────────── working table ──

function WorkingTableBar({
    tables,
    loading,
    error,
    selectedId,
    onSelect,
    onOpenTable,
}: {
    tables: Table[];
    loading: boolean;
    error: string | null;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onOpenTable: (id: string) => void;
}) {
    if (error) return <Refusal>{error}</Refusal>;
    if (loading && tables.length === 0) {
        return (
            <p className="px-1 text-sm text-muted-foreground">Reading this organization’s tables…</p>
        );
    }
    if (tables.length === 0) {
        return (
            <p className="px-1 text-sm text-muted-foreground">
                This organization has no tables yet, so sections 3 and 5 onwards have nothing to act on.
                Make one in section 1 and they all come alive.
            </p>
        );
    }
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <label htmlFor="try-working-table" className="text-xs text-muted-foreground">
                Sections below work on
            </label>
            <select
                id="try-working-table"
                value={selectedId ?? ""}
                onChange={(event) => onSelect(event.target.value)}
                className="min-w-0 max-w-[16rem] truncate rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
            >
                {tables.map((table) => (
                    <option key={table.id} value={table.id}>
                        {tableName(table)}
                    </option>
                ))}
            </select>
            {selectedId ? (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => onOpenTable(selectedId)}
                >
                    Open its full screen
                    <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden />
                </Button>
            ) : null}
        </div>
    );
}

/**
 * A LIVE PANEL THAT WRITES SOMETHING THE MOMENT IT MOUNTS.
 *
 * Three of the screens in this package keep their own bookkeeping in a table of
 * their own and MAKE that table the first time they run. Opening a section to
 * read about it should not put a table in somebody's organization, and at the
 * version this deployment serves those tables come out half-made — so the panel
 * sits behind its own button, and the button says what pressing it does before
 * it does it (the destructive-and-expensive-click law).
 */
function WritesItsOwnTable({
    what,
    whatHappens,
    children,
}: {
    /** "the form builder" — used in the button's own sentence. */
    what: string;
    /** What mounting it writes, in plain words. */
    whatHappens: string;
    children: ReactNode;
}) {
    const [opened, setOpened] = useState(false);
    if (opened) {
        return (
            <TryIt hint="this panel is live and is writing into this organization">
                <div className="rounded-md border border-border p-3">{children}</div>
            </TryIt>
        );
    }
    return (
        <div className="space-y-2 rounded-md border border-amber-600/40 bg-amber-500/5 p-3 dark:border-amber-400/40">
            <p className="text-sm leading-relaxed text-foreground/90">{whatHappens}</p>
            {/* WHAT THIS VERSION CAN DO IS NOT SAID HERE. The section above this
                button asked the live doors and printed their answer; a second
                sentence typed into this component is exactly the note that
                outlived its defect and told a person not to press the button. */}
            <Button variant="outline" size="sm" onClick={() => setOpened(true)}>
                Open {what} anyway
            </Button>
        </div>
    );
}

/** Renders `children` with the working table, or says plainly why it cannot. */
function NeedsTable({
    table,
    children,
}: {
    table: Table | null;
    children: (table: Table) => ReactNode;
}) {
    if (!table) {
        return (
            <p className="text-sm text-muted-foreground">
                Pick a table in the bar above first — this part acts on one of your tables, and there is no
                honest way to show it without one. Section 1 makes one in a few seconds.
            </p>
        );
    }
    return <>{children(table)}</>;
}

// ───────────────────────────────────────────────────────────────── sharing ──

function ShareTry({ table, organizationId }: { table: Table | null; organizationId: string }) {
    if (!table) {
        return (
            <p className="text-sm text-muted-foreground">
                Make a table in section 1 and the Share control appears here for it.
            </p>
        );
    }
    return (
        <TryIt hint="this really gives a colleague access">
            <div className="flex flex-wrap items-center gap-2">
                {/* The app's ONE share dialog, opened by the package's own
                    control. Not a copy of it — `host.share` above hands the
                    package the same dialog every other screen uses. */}
                <ShareControl
                    kind="table"
                    organizationId={organizationId}
                    subjectId={table.id}
                    name={tableName(table)}
                    variant="outline"
                />
                <span className="text-xs text-muted-foreground">
                    Share {tableName(table)} with someone, then open the Access tab in the same dialog.
                </span>
            </div>
        </TryIt>
    );
}

/**
 * THE ORGANIZATION'S OWN SETTING, changed from here.
 *
 * It goes through `platform.knob_write_door_for`, so the door decides whether
 * this person may write it and hands back the sentence to show when they may
 * not — the control is then ABSENT with its reason, never a switch that shrugs.
 */
function MemberVisibilityControl({
    organizationId,
    userId,
}: {
    organizationId: string;
    userId: string | null;
}) {
    const current = useEffectiveKnob(organizationId, userId, MEMBER_VISIBILITY);
    // The choices and their words come from the registry, through the same
    // knob door this control writes back through.
    const { choices, loading: choicesLoading, problem: choicesProblem } = useKnobChoices(
        organizationId,
        MEMBER_VISIBILITY,
        userId,
    );
    const [door, setDoor] = useState<KnobWriteDoor | null>(null);
    const [doorProblem, setDoorProblem] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [refusal, setRefusal] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setDoor(null);
        setDoorProblem(null);
        void fetchKnobWriteDoor({ fullKey: MEMBER_VISIBILITY_FULL_KEY, organizationId })
            .then((answer) => {
                if (!cancelled) setDoor(answer);
            })
            .catch((error: unknown) => {
                if (!cancelled)
                    setDoorProblem(error instanceof Error ? error.message : String(error));
            });
        return () => {
            cancelled = true;
        };
    }, [organizationId]);

    const set = useCallback(
        async (value: string) => {
            if (!door) return;
            setBusy(true);
            setRefusal(null);
            try {
                const result = await writeKnobOverrideThroughDoor({
                    door,
                    feature: MEMBER_VISIBILITY.feature,
                    key: MEMBER_VISIBILITY.key,
                    scopeKind: "organization",
                    scopeId: organizationId,
                    organizationId,
                    value,
                    note: "Set from the Try everything page.",
                });
                if (result && typeof result === "object" && "ok" in result && result.ok === false) {
                    setRefusal(
                        [
                            (result as { reason?: string }).reason,
                            (result as { detail?: string }).detail,
                        ]
                            .filter(Boolean)
                            .join(" — ") || "The setting was refused and the door gave no reason.",
                    );
                }
            } catch (error) {
                setRefusal(error instanceof Error ? error.message : String(error));
            } finally {
                setBusy(false);
            }
        },
        [door, organizationId],
    );

    if (doorProblem) {
        return (
            <Refusal>
                This organization’s visibility setting could not be read — {doorProblem}
            </Refusal>
        );
    }
    if (!door) {
        return <p className="text-sm text-muted-foreground">Asking who may change this setting…</p>;
    }
    if (door.mayWrite === false) {
        // ABSENT, NOT DEAD. No switch at all, and the door's own sentence.
        return <Aside>{door.authorityDetail}</Aside>;
    }
    if (choicesProblem) {
        return <Refusal>{choicesProblem}</Refusal>;
    }
    if (choicesLoading) {
        return <p className="text-sm text-muted-foreground">Reading what this setting can be set to…</p>;
    }

    return (
        <TryIt hint="this changes it for everybody in this organization">
            <div className="space-y-1.5">
                {choices.map((choice) => (
                    <label key={choice.value} className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                            type="radio"
                            name="member-visibility"
                            className="mt-0.5"
                            checked={current === choice.value}
                            disabled={busy || current === undefined}
                            onChange={() => void set(choice.value)}
                        />
                        <span className="min-w-0">
                            <span className="text-foreground">{choice.label}</span>
                            {choice.help ? (
                                <span className="block text-xs text-muted-foreground">{choice.help}</span>
                            ) : null}
                        </span>
                    </label>
                ))}
                {current === undefined ? (
                    <Aside>Reading the current setting…</Aside>
                ) : (
                    <Aside>
                        Switch it and re-open the Access tab above: the sentence it shows changes with it,
                        because both read this one setting.
                    </Aside>
                )}
                {refusal ? <Refusal>{refusal}</Refusal> : null}
            </div>
        </TryIt>
    );
}

// ───────────────────────────────────────────────────────────── CRM contact ──

function CrmContactTry({ organizationId }: { organizationId: string }) {
    const [contacts, setContacts] = useState<Array<{ id: string; display_name: string }> | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [chosen, setChosen] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setContacts(null);
        setProblem(null);
        void searchPartiesByName({ orgId: organizationId, search: "" })
            .then((rows) => {
                if (cancelled) return;
                const named = rows.map((row) => ({
                    id: row.id,
                    display_name: row.display_name ?? row.id.slice(0, 8),
                }));
                setContacts(named);
                setChosen(named[0]?.id ?? null);
            })
            .catch((error: unknown) => {
                if (!cancelled) setProblem(error instanceof Error ? error.message : String(error));
            });
        return () => {
            cancelled = true;
        };
    }, [organizationId]);

    if (problem) return <Refusal>Could not read this organization’s contacts — {problem}</Refusal>;
    if (contacts === null) return <p className="text-sm text-muted-foreground">Finding a contact…</p>;
    if (contacts.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                This organization has no CRM contacts yet, so there is nothing here to extend. Add one in
                the CRM and this section works on it.{" "}
                <Link href="/crm" className="underline underline-offset-2">
                    Open the CRM
                </Link>
            </p>
        );
    }

    return (
        <TryIt hint="this adds a real column to a real contact">
            <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="try-contact" className="text-xs text-muted-foreground">
                        Contact
                    </label>
                    <select
                        id="try-contact"
                        value={chosen ?? ""}
                        onChange={(event) => setChosen(event.target.value)}
                        className="min-w-0 max-w-[16rem] truncate rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                    >
                        {contacts.map((contact) => (
                            <option key={contact.id} value={contact.id}>
                                {contact.display_name}
                            </option>
                        ))}
                    </select>
                    {chosen ? (
                        /* THE DOOR LAW: the contact is named through the one
                           party door (route + new tab + peek), never a
                           hand-built `/crm/<id>` string. */
                        <EntityRef
                            token="party"
                            id={chosen}
                            name={
                                contacts.find((contact) => contact.id === chosen)?.display_name ??
                                null
                            }
                            className="text-xs"
                        />
                    ) : null}
                </div>
                {chosen ? (
                    <div className="rounded-md border border-border p-3">
                        {/* The SAME section the CRM contact page mounts, in one
                            line, addressed by the standard table's token. */}
                        <CustomFieldsSection entityToken="party" recordId={chosen} />
                    </div>
                ) : null}
                <Aside>
                    Whatever you add here is on the contact’s own page too — it is one store, not a copy.
                </Aside>
            </div>
        </TryIt>
    );
}

// ─────────────────────────────────────────────────────────────────── agent ──

function AgentTry({ organizationId }: { organizationId: string }) {
    const [agents, setAgents] = useState<Array<{ id: string; name: string }> | null>(null);
    const [problem, setProblem] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setAgents(null);
        setProblem(null);
        void createClient()
            .schema("agent")
            .from("definition")
            .select("id,name,updated_at")
            .eq("organization_id", organizationId)
            .is("deleted_at", null)
            // archived-items-law-exempt: an agent PICKER for the test bench —
            // it offers live agents to try, it is not a browse list of the
            // person's agents, and an archived agent is never offered to run.
            .eq("is_archived", false)
            .order("updated_at", { ascending: false })
            .limit(6)
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) {
                    setProblem(error.message);
                    return;
                }
                setAgents((data ?? []).map((row) => ({ id: row.id, name: row.name })));
            });
        return () => {
            cancelled = true;
        };
    }, [organizationId]);

    return (
        <div className="space-y-3">
            <TryIt hint="the agent really writes into this organization">
                {problem ? (
                    <Refusal>Could not list this organization’s agents — {problem}</Refusal>
                ) : agents === null ? (
                    <p className="text-sm text-muted-foreground">Finding this organization’s agents…</p>
                ) : agents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        This organization has no agents yet.{" "}
                        <Link href="/agents/all" className="underline underline-offset-2">
                            Make one
                        </Link>{" "}
                        — it arrives with the Records tool already on, because this organization’s store is on.
                    </p>
                ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                        {agents.map((agent) => (
                            <li key={agent.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                                <span className="min-w-0 flex-1 truncate text-foreground">{agent.name}</span>
                                <Link
                                    href={`/chat/a/${agent.id}`}
                                    className="shrink-0 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
                                >
                                    Chat with it
                                </Link>
                                <Link
                                    href={`/agents/${agent.id}/build`}
                                    className="shrink-0 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
                                >
                                    Its tools
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </TryIt>
            <Aside>
                Say “make me a table of my crews with their city and day rate, and put twenty realistic rows
                in it”, then come back to section 1 and it is there. Ask it to add a column to a table you
                made yourself and it has to ask you first — that request lands in section 6.
            </Aside>
            <NotBuiltYet
                today={
                    "The chat, the Records tool, the table it builds and the approval card when it touches " +
                    "something you made are all live."
                }
                waitingFor={
                    "nothing, for the agent itself. The chat box is deliberately not repeated on this page: " +
                    "AI Matrx has one chat, and a second one here would be a copy that drifts. “Chat with it” " +
                    "opens the real one, already bound to that agent."
                }
            />
        </div>
    );
}

// ────────────────────────────────────────────────────────── history & undo ──

function HistoryTry({ table }: { table: Table }) {
    const records = useRecords(table.id, { pageSize: 8 });
    const [chosen, setChosen] = useState<string | null>(null);
    const rows = records.data?.rows ?? [];
    const recordId = chosen ?? rows[0]?.id ?? null;

    if (records.error) return <Refusal>{refusalLineForAPerson(records.error)}</Refusal>;
    if (records.loading && rows.length === 0) {
        return <p className="text-sm text-muted-foreground">Reading this table’s records…</p>;
    }
    if (rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                {tableName(table)} has no records yet, so there is no history to show. Type a row into it in
                section 1 and it appears here.
            </p>
        );
    }

    return (
        <TryIt hint="putting a value back really writes it back">
            <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="try-record" className="text-xs text-muted-foreground">
                        Record
                    </label>
                    <select
                        id="try-record"
                        value={recordId ?? ""}
                        onChange={(event) => setChosen(event.target.value)}
                        className="min-w-0 max-w-[16rem] truncate rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                    >
                        {rows.map((row) => (
                            <option key={row.id} value={row.id}>
                                {rowNameIn(table, row)}
                            </option>
                        ))}
                    </select>
                </div>
                {recordId ? (
                    <div className="rounded-md border border-border p-3">
                        <HistoryPanel tableId={table.id} recordId={recordId} />
                    </div>
                ) : null}
            </div>
        </TryIt>
    );
}

// ──────────────────────────────────────────────────────────── the doors ──

/**
 * ONE PLACE THAT CALLS A STORE DOOR BY NAME.
 *
 * The two sections below reach doors the SCREENS PACKAGE does not reach yet at
 * the version this deployment serves, so they ask the store directly — through
 * the package's OWN data source, which is the same object every other call on
 * this page goes through and the same pattern the status strip already uses for
 * `custom.work_inbox`. It is a door call, never a table read: the five names
 * below were declared in `platform.client_callable_door` and granted to
 * `authenticated` by `migrations/campaign/doorstwo_the_document_and_cadence_doors.sql`,
 * and each one runs the ladder (`assert_client_may_reach`, then
 * `assert_client_may_open`/`_may_change`) before it returns a row.
 */
async function door<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await recordsDataSource(createClient()).rpc(name, args, {
        schema: "custom",
    });
    // THE STORE'S OWN SENTENCE, verbatim. These doors are written to refuse in
    // English ("That notification is not addressed to you, so you cannot switch
    // it off."), so anything this screen wrote over the top would be worse.
    if (error) throw new Error(error.message);
    return data as T;
}

/** What `custom.doc_templates` answers. */
interface TemplateRow {
    template_id: string;
    name: string;
    body: string;
    template_version: number;
    token_count: number;
}

/**
 * One row of `custom.applicable_fields`, which answers `custom.record` rows of
 * data_class `field`. Only the two keys this screen reads are named.
 */
interface FieldRow {
    id: string;
    data: { key?: string; label?: string; type?: string; format?: string } | null;
}

/** What `custom.doc_renders` answers — frozen bytes and the hash a seal is over. */
interface RenderRow {
    render_id: string;
    template_id: string;
    template_version: number;
    body: string;
    content_hash: string;
    rendered_at: string;
}

/** What `custom.subscriptions` answers about one subscription, from its owner's side. */
interface SubscriptionRow {
    rule_id: string;
    name: string;
    cadence: string;
    schedule: string | null;
    channel: string;
    muted: boolean;
    mine: boolean;
    i_may_mute: boolean;
    saved_view_id: string | null;
    recipient_user_id: string | null;
}

/**
 * SECTION 11b — PRODUCTS row 16, *"Have the client sign this before we start."*
 *
 * A signature is a Value on the record with its own audit trail, never a detour
 * into another vendor. What this screen adds to the six document acts above is
 * the SEVENTH: asking somebody outside the organization to sign one of those
 * frozen documents, and watching for their answer.
 */
interface SignRequestRow {
    request_id: string;
    render_id: string;
    record_id: string;
    field_key: string;
    document_title: string | null;
    signer_name: string;
    signer_email: string;
    signer_has_account: boolean;
    state: "sent" | "viewed" | "signed" | "declined" | "invalidated" | "expired";
    /** The store's own sentence. This screen shows it and writes none of its own. */
    sentence: string;
    document_version: number;
    document_hash: string;
    sent_at: string;
    expires_at: string;
    viewed_at: string | null;
    signed_at: string | null;
    declined_at: string | null;
    invalidated_at: string | null;
    signature_id: string | null;
    signature_mark: string | null;
    reminder_count: number;
}

/** What `custom.sign_request_create` hands back — the link's secret, exactly once. */
interface SignRequestMade {
    request_id: string;
    path: string;
    signer_email: string;
    signer_has_account: boolean;
    document_version: number;
    expires_at: string;
}

// ─────────────────────────────────────────────────────────────── documents ──

/**
 * SECTION 11 — WRITE THE WORDING ONCE, RENDER IT FOR ANY RECORD.
 *
 * Six acts, six doors, nothing else: list the templates of this table, write or
 * change one, retire one, render this record into a document, list the documents
 * already made from it, and open one.
 *
 * A TOKEN NAMES A FIELD BY ITS ID (REC-68 — PandaDoc's mechanism), so renaming a
 * column never breaks a template. `custom.doc_template_save` refuses a token
 * naming no Field AT SAVE and its refusal names the token AND lists the fields
 * that are available, so this screen shows that sentence and writes none of its
 * own.
 *
 * THE RESULT OPENS IN `RichDocument`, the platform's one rich document — print
 * and save-as-PDF come with it. A second renderer here would drift from every
 * other document surface in the app.
 */
function DocumentsTry({ table, organizationId }: { table: Table; organizationId: string }) {
    const records = useRecords(table.id, { pageSize: 25 });
    const rows = records.data?.rows ?? [];

    const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [templateId, setTemplateId] = useState<string | null>(null);
    const [recordId, setRecordId] = useState<string | null>(null);
    const [renders, setRenders] = useState<RenderRow[] | null>(null);
    const [openRender, setOpenRender] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [refusal, setRefusal] = useState<string | null>(null);
    const [draftName, setDraftName] = useState("");
    const [draftBody, setDraftBody] = useState("");
    // PRODUCTS row 16 — asking somebody to sign one of these frozen documents.
    const [signRequests, setSignRequests] = useState<SignRequestRow[] | null>(null);
    const [signatureFields, setSignatureFields] = useState<FieldRow[]>([]);
    const [askingOn, setAskingOn] = useState<string | null>(null);
    const [askEmail, setAskEmail] = useState("");
    const [askName, setAskName] = useState("");
    const [askField, setAskField] = useState<string | null>(null);
    const [madeLink, setMadeLink] = useState<SignRequestMade | null>(null);

    const chosenRecord = recordId ?? rows[0]?.id ?? null;
    const chosenTemplate = templates?.find((t) => t.template_id === templateId) ?? templates?.[0] ?? null;

    const loadTemplates = useCallback(async () => {
        setProblem(null);
        try {
            setTemplates(
                await door<TemplateRow[]>("doc_templates", {
                    p_organization_id: organizationId,
                    p_table_id: table.id,
                }),
            );
        } catch (error) {
            setTemplates([]);
            setProblem(error instanceof Error ? error.message : String(error));
        }
    }, [organizationId, table.id]);

    const loadRenders = useCallback(async () => {
        if (!chosenRecord) {
            setRenders([]);
            return;
        }
        try {
            setRenders(
                await door<RenderRow[]>("doc_renders", {
                    p_organization_id: organizationId,
                    p_record_id: chosenRecord,
                }),
            );
        } catch (error) {
            setRenders([]);
            setProblem(error instanceof Error ? error.message : String(error));
        }
    }, [organizationId, chosenRecord]);

    const loadSignRequests = useCallback(async () => {
        if (!chosenRecord) {
            setSignRequests([]);
            return;
        }
        try {
            setSignRequests(
                await door<SignRequestRow[]>("sign_requests", {
                    p_organization_id: organizationId,
                    p_record_id: chosenRecord,
                }),
            );
        } catch (error) {
            setSignRequests([]);
            setProblem(error instanceof Error ? error.message : String(error));
        }
    }, [organizationId, chosenRecord]);

    // WHICH COLUMN THE SIGNATURE IS. VAL-10 makes a signature a Value, so it
    // belongs to a Field — a text Field whose format is `signature`. The store
    // answers which ones those are; this screen never guesses.
    const loadSignatureFields = useCallback(async () => {
        try {
            const fields = await door<FieldRow[]>("applicable_fields", {
                p_organization_id: organizationId,
                p_table_id: table.id,
                p_record_type: null,
            });
            setSignatureFields(
                fields.filter(
                    (field) => field.data?.type === "text" && field.data?.format === "signature",
                ),
            );
        } catch {
            // Not a refusal worth a banner: the ask control below is ABSENT when
            // there is no signature column, and says why.
            setSignatureFields([]);
        }
    }, [organizationId, table.id]);

    useEffect(() => {
        void loadTemplates();
    }, [loadTemplates]);
    useEffect(() => {
        void loadRenders();
    }, [loadRenders]);
    useEffect(() => {
        void loadSignRequests();
    }, [loadSignRequests]);
    useEffect(() => {
        void loadSignatureFields();
    }, [loadSignatureFields]);

    async function act(what: () => Promise<void>) {
        setBusy(true);
        setRefusal(null);
        try {
            await what();
        } catch (error) {
            setRefusal(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    }

    if (problem && templates !== null && templates.length === 0 && renders === null) {
        return <Refusal>{problem}</Refusal>;
    }
    if (templates === null) {
        return <p className="text-sm text-muted-foreground">Reading this table’s document templates…</p>;
    }

    return (
        <div className="space-y-3">
            <TryIt hint={`writes a real template on ${tableName(table)} and real documents on its records`}>
                <div className="space-y-3">
                    {/* ── the templates this table already has ─────────────── */}
                    {templates.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {tableName(table)} has no document templates yet. Write one below — the wording is
                            yours, and <code className="rounded bg-muted px-1">{"{{field:<id>}}"}</code> drops
                            one of this table’s columns into it.
                        </p>
                    ) : (
                        <ul className="divide-y divide-border rounded-md border border-border">
                            {templates.map((template) => (
                                <li
                                    key={template.template_id}
                                    className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                                >
                                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                                        <input
                                            type="radio"
                                            name="try-doc-template"
                                            checked={chosenTemplate?.template_id === template.template_id}
                                            onChange={() => setTemplateId(template.template_id)}
                                        />
                                        <span className="truncate text-foreground">{template.name}</span>
                                    </label>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        version {template.template_version} ·{" "}
                                        {template.token_count === 1
                                            ? "1 column merged in"
                                            : `${template.token_count} columns merged in`}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 shrink-0 px-2 text-xs"
                                        disabled={busy}
                                        onClick={() => {
                                            setTemplateId(template.template_id);
                                            setDraftName(template.name);
                                            setDraftBody(template.body);
                                        }}
                                    >
                                        Edit its wording
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 shrink-0 px-2 text-xs"
                                        disabled={busy}
                                        onClick={() =>
                                            void act(async () => {
                                                // Soft, and it says what survives: documents
                                                // already rendered keep their bytes and their
                                                // seals, so this cannot invalidate a signature.
                                                await door<boolean>("doc_template_delete", {
                                                    p_organization_id: organizationId,
                                                    p_template_id: template.template_id,
                                                });
                                                await loadTemplates();
                                            })
                                        }
                                    >
                                        Retire it
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* ── write or change one ──────────────────────────────── */}
                    <div className="space-y-2 rounded-md border border-border p-3">
                        <input
                            value={draftName}
                            onChange={(event) => setDraftName(event.target.value)}
                            placeholder="What this document is called — Proposal, Quote, Welcome letter"
                            className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                        />
                        <textarea
                            value={draftBody}
                            onChange={(event) => setDraftBody(event.target.value)}
                            rows={5}
                            placeholder="The wording. Drop a column in with {{field:<the column's id>}} — the store refuses a token that names no column of this table, and tells you which columns it has."
                            className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                size="sm"
                                disabled={busy || draftName.trim() === ""}
                                onClick={() =>
                                    void act(async () => {
                                        await door<string>("doc_template_save", {
                                            p_organization_id: organizationId,
                                            p_table_id: table.id,
                                            p_name: draftName,
                                            p_body: draftBody,
                                            p_template_id: null,
                                        });
                                        setDraftName("");
                                        setDraftBody("");
                                        await loadTemplates();
                                    })
                                }
                            >
                                Save it as a new template
                            </Button>
                            {chosenTemplate ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busy || draftName.trim() === ""}
                                    onClick={() =>
                                        void act(async () => {
                                            await door<string>("doc_template_save", {
                                                p_organization_id: organizationId,
                                                p_table_id: table.id,
                                                p_name: draftName,
                                                p_body: draftBody,
                                                p_template_id: chosenTemplate.template_id,
                                            });
                                            await loadTemplates();
                                        })
                                    }
                                >
                                    Replace “{chosenTemplate.name}” with this
                                </Button>
                            ) : null}
                        </div>
                        <Aside>
                            Every save of an existing template is a new version, because a signature seals a
                            document version — a body that could move under a signed document would make the
                            seal meaningless.
                        </Aside>
                    </div>

                    {/* ── render this record ───────────────────────────────── */}
                    {rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {tableName(table)} has no records yet, so there is nothing to render a document
                            about. Type a row into it in section 1 and this comes alive.
                        </p>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            <label htmlFor="try-doc-record" className="text-xs text-muted-foreground">
                                Render
                            </label>
                            <select
                                id="try-doc-record"
                                value={chosenRecord ?? ""}
                                onChange={(event) => setRecordId(event.target.value)}
                                className="min-w-0 max-w-[16rem] truncate rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                            >
                                {rows.map((row) => (
                                    <option key={row.id} value={row.id}>
                                        {rowNameIn(table, row)}
                                    </option>
                                ))}
                            </select>
                            <Button
                                size="sm"
                                disabled={busy || !chosenTemplate || !chosenRecord}
                                onClick={() =>
                                    void act(async () => {
                                        if (!chosenTemplate || !chosenRecord) return;
                                        const renderId = await door<string>("doc_render_document", {
                                            p_organization_id: organizationId,
                                            p_template_id: chosenTemplate.template_id,
                                            p_record_id: chosenRecord,
                                        });
                                        setOpenRender(renderId);
                                        await loadRenders();
                                    })
                                }
                            >
                                {chosenTemplate
                                    ? `as a “${chosenTemplate.name}”`
                                    : "— pick a template first"}
                            </Button>
                        </div>
                    )}

                    {refusal ? <Refusal>{refusal}</Refusal> : null}

                    {/* ── the documents already made from this record ──────── */}
                    {renders && renders.length > 0 ? (
                        <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">
                                {renders.length === 1
                                    ? "1 document made from this record"
                                    : `${renders.length} documents made from this record`}{" "}
                                — each one frozen at the moment it was made, which is what a signature is over.
                            </p>
                            <ul className="divide-y divide-border rounded-md border border-border">
                                {renders.map((render) => (
                                    <li
                                        key={render.render_id}
                                        className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                                    >
                                        <span className="min-w-0 flex-1 truncate text-foreground">
                                            {templates.find((t) => t.template_id === render.template_id)?.name ??
                                                "A template that has since been retired"}{" "}
                                            <span className="text-xs text-muted-foreground">
                                                version {render.template_version}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                            {new Date(render.rendered_at).toLocaleString()}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 shrink-0 px-2 text-xs"
                                            onClick={() =>
                                                setOpenRender((was) =>
                                                    was === render.render_id ? null : render.render_id,
                                                )
                                            }
                                        >
                                            {openRender === render.render_id ? "Close it" : "Open it"}
                                        </Button>
                                        {/* PRODUCTS row 16. ABSENT, NEVER DEAD: with no
                                            signature column on this table there is no
                                            button at all, and the line under the list
                                            says what to declare. */}
                                        {signatureFields.length > 0 ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 shrink-0 px-2 text-xs"
                                                disabled={busy}
                                                onClick={() => {
                                                    setMadeLink(null);
                                                    setRefusal(null);
                                                    setAskField(
                                                        askField ??
                                                            signatureFields[0]?.data?.key ??
                                                            null,
                                                    );
                                                    setAskingOn((was) =>
                                                        was === render.render_id
                                                            ? null
                                                            : render.render_id,
                                                    );
                                                }}
                                            >
                                                {askingOn === render.render_id
                                                    ? "Never mind"
                                                    : "Request signature"}
                                            </Button>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                            {signatureFields.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    To ask somebody to sign one of these, {tableName(table)} needs a
                                    signature column — a text column whose format is{" "}
                                    <code className="rounded bg-muted px-1">signature</code>. Declare one
                                    in section 1 and the button appears here.
                                </p>
                            ) : null}

                            {/* ── ask somebody to sign this exact version ──────────── */}
                            {askingOn ? (
                                <div className="space-y-2 rounded-md border border-border p-3">
                                    <p className="text-xs text-muted-foreground">
                                        They get an unguessable link that works for fourteen days and is
                                        over THIS version of the document. If this record changes before
                                        they sign, the link stops working and says so — nobody signs a
                                        document the record no longer supports.
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <input
                                            value={askName}
                                            onChange={(event) => setAskName(event.target.value)}
                                            placeholder="Who is signing — their name"
                                            className="min-w-48 flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                                        />
                                        <input
                                            value={askEmail}
                                            onChange={(event) => setAskEmail(event.target.value)}
                                            placeholder="Their email address"
                                            className="min-w-48 flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                                        />
                                        {signatureFields.length > 1 ? (
                                            <select
                                                value={askField ?? ""}
                                                onChange={(event) => setAskField(event.target.value)}
                                                className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                                            >
                                                {signatureFields.map((field) => (
                                                    <option
                                                        key={field.id}
                                                        value={field.data?.key ?? ""}
                                                    >
                                                        {field.data?.label ?? field.data?.key}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : null}
                                        <Button
                                            size="sm"
                                            disabled={
                                                busy ||
                                                askEmail.trim() === "" ||
                                                askName.trim() === ""
                                            }
                                            onClick={() =>
                                                void act(async () => {
                                                    const made = await door<SignRequestMade>(
                                                        "sign_request_create",
                                                        {
                                                            p_organization_id: organizationId,
                                                            p_render_id: askingOn,
                                                            p_field_key:
                                                                askField ??
                                                                signatureFields[0]?.data?.key ??
                                                                null,
                                                            p_signer_email: askEmail.trim(),
                                                            p_signer_name: askName.trim(),
                                                            p_expires_in: "14 days",
                                                        },
                                                    );
                                                    setMadeLink(made);
                                                    setAskingOn(null);
                                                    setAskEmail("");
                                                    setAskName("");
                                                    await loadSignRequests();
                                                })
                                            }
                                        >
                                            Send it
                                        </Button>
                                    </div>
                                </div>
                            ) : null}

                            {/* THE LINK IS SHOWN ONCE AND ONLY ONCE, because only its
                                SHA-256 is kept. Saying so is the difference between a
                                screen that is honest and one the person later blames. */}
                            {madeLink ? (
                                <div className="space-y-1 rounded-md border border-border p-3">
                                    <p className="text-sm text-foreground">
                                        Send this link to {madeLink.signer_email}. It is shown once —
                                        the store keeps only a fingerprint of it, so nobody here can
                                        read it back, and nobody who reads this database can sign.
                                    </p>
                                    <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                                        {madeLink.path}
                                    </code>
                                    <p className="text-xs text-muted-foreground">
                                        Works until {new Date(madeLink.expires_at).toLocaleString()}.
                                        {madeLink.signer_has_account
                                            ? " They have an account here, so reminders can be sent in the app."
                                            : " They have no account here, so reminders are yours to send."}
                                    </p>
                                </div>
                            ) : null}

                            {/* ── what was asked, and what came back ───────────────── */}
                            {signRequests && signRequests.length > 0 ? (
                                <ul className="divide-y divide-border rounded-md border border-border">
                                    {signRequests.map((ask) => (
                                        <li
                                            key={ask.request_id}
                                            className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="text-foreground">
                                                    {ask.signer_name}
                                                </span>{" "}
                                                <span className="text-xs text-muted-foreground">
                                                    {ask.signer_email} · version{" "}
                                                    {ask.document_version} ·{" "}
                                                    {ask.document_hash.slice(0, 12)}
                                                </span>
                                                {/* THE STORE'S SENTENCE, VERBATIM. */}
                                                <span className="block text-xs text-muted-foreground">
                                                    {ask.sentence}
                                                    {ask.reminder_count > 0
                                                        ? ask.reminder_count === 1
                                                            ? " Reminded once."
                                                            : ` Reminded ${ask.reminder_count} times.`
                                                        : ""}
                                                </span>
                                            </span>
                                            {/* Only a live request can be nudged or
                                                withdrawn; an answered one carries no
                                                control rather than a dead one. */}
                                            {ask.state === "sent" || ask.state === "viewed" ? (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 shrink-0 px-2 text-xs"
                                                        disabled={busy}
                                                        onClick={() =>
                                                            void act(async () => {
                                                                const answer = await door<{
                                                                    reminded: boolean;
                                                                    message: string;
                                                                }>("sign_request_remind", {
                                                                    p_organization_id: organizationId,
                                                                    p_request_id: ask.request_id,
                                                                });
                                                                if (!answer.reminded) {
                                                                    setRefusal(answer.message);
                                                                }
                                                                await loadSignRequests();
                                                            })
                                                        }
                                                    >
                                                        Remind them
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 shrink-0 px-2 text-xs"
                                                        disabled={busy}
                                                        onClick={() =>
                                                            void act(async () => {
                                                                await door("sign_request_cancel", {
                                                                    p_organization_id: organizationId,
                                                                    p_request_id: ask.request_id,
                                                                    p_reason: null,
                                                                });
                                                                await loadSignRequests();
                                                            })
                                                        }
                                                    >
                                                        Withdraw it
                                                    </Button>
                                                </>
                                            ) : null}
                                            {ask.state === "signed" ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 shrink-0 px-2 text-xs"
                                                    onClick={() =>
                                                        setOpenRender((was) =>
                                                            was === ask.render_id
                                                                ? null
                                                                : ask.render_id,
                                                        )
                                                    }
                                                >
                                                    {openRender === ask.render_id
                                                        ? "Close the signed document"
                                                        : "Open the signed document"}
                                                </Button>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                            {openRender ? (
                                <div className="rounded-md border border-border p-3">
                                    {/* THE PLATFORM'S ONE RICH DOCUMENT. Print and
                                        save-as-PDF live in its own overflow menu. */}
                                    <RichDocument imagePolicy="other"
                                        content={
                                            renders.find((render) => render.render_id === openRender)?.body ?? ""
                                        }
                                        source={{ type: "raw" }}
                                        actionsVariant="mini-bar"
                                    />
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </TryIt>
            <NotBuiltYet
                today={
                    "All seven acts above are real and go through the store’s own doors: the templates of " +
                    "this table, writing and changing one, retiring one, rendering this record into a " +
                    "document, the documents already made from it, opening one with print and save-as-PDF " +
                    "on it, and asking somebody outside your organization to sign one — they get an " +
                    "unguessable link that expires, they type or draw their name, and the signature lands " +
                    "as a value on this record with who, when, from where, on what browser and the hash of " +
                    "the exact document version they saw. Change the record after asking and the link stops " +
                    "working and says why."
                }
                waitingFor={
                    "three things, none of which stops you using it. A token is written by hand as the " +
                    "column’s id — the agent writing the template from the table’s own fields is the next " +
                    "step. There is no letterhead, so a document is the wording you typed and nothing around " +
                    "it. And a reminder reaches a signer who has an account here through the notification " +
                    "bell; a signer with no account is told so in words, and sending them the link again is " +
                    "yours to do, because there is no outbound email lane yet."
                }
            />
        </div>
    );
}

// ─────────────────────────────────────────────────────────── notifications ──

/**
 * SECTION 12 — WHAT YOU ARE BEING TOLD ABOUT, AND HOW TO MAKE IT STOP.
 *
 * `custom.subscriptions` answers what is addressed to THIS person plus — only
 * where they hold admin on this table — anyone's over it, narrowed to tables
 * they can already open, so a subscription list is never a second way to learn
 * that a table exists. `custom.subscription_mute` is the switch.
 *
 * ABSENT, NEVER DEAD. A row the store says this person may not mute carries no
 * switch at all — not a greyed one — and says whose it is instead. The store
 * answers that question (`i_may_mute`); this screen never works it out.
 *
 * OFF MEANS OFF. Muting is honoured inside `custom.agg_subscriptions`, the one
 * reader every consumer goes through, so "switched off here" and "does not fire"
 * are the same fact rather than two that can drift.
 */
function NotificationsTry({ table, organizationId }: { table: Table; organizationId: string }) {
    const [rows, setRows] = useState<SubscriptionRow[] | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        setProblem(null);
        try {
            setRows(
                await door<SubscriptionRow[]>("subscriptions", {
                    p_organization_id: organizationId,
                    p_table_id: table.id,
                }),
            );
        } catch (error) {
            setRows([]);
            setProblem(error instanceof Error ? error.message : String(error));
        }
    }, [organizationId, table.id]);

    useEffect(() => {
        void load();
    }, [load]);

    if (problem) return <Refusal>{problem}</Refusal>;
    if (rows === null) {
        return <p className="text-sm text-muted-foreground">Reading what this table tells people about…</p>;
    }

    return (
        <div className="space-y-3">
            <TryIt hint="switching one off really stops it firing, on every channel at once">
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                        {rows.length === 0
                            ? "Nothing is telling anyone about this table yet."
                            : `${rows.filter((row) => !row.muted).length} of ${rows.length} on`}
                    </p>
                    {rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Write one in the panel above, or publish a form in section 5 that says “tell me when
                            somebody answers” — it appears here the moment it does.
                        </p>
                    ) : (
                        <ul className="divide-y divide-border rounded-md border border-border">
                            {rows.map((row) => (
                                <li key={row.rule_id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm text-foreground">{row.name}</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {row.channel === "in_app"
                                                ? "in the app"
                                                : row.channel === "email"
                                                  ? "by email — only if an address is on the account"
                                                  : `on the ${row.channel} channel`}
                                            {" · "}
                                            {row.cadence === "immediate"
                                                ? "as it happens"
                                                : row.schedule
                                                  ? `a summary, ${row.schedule}`
                                                  : "a summary"}
                                            {" · "}
                                            {row.mine ? "addressed to you" : "addressed to somebody else here"}
                                        </p>
                                        {row.recipient_user_id === null ? (
                                            <p className="mt-0.5 text-xs text-destructive">
                                                This one has nobody to tell, so it fires at nobody.
                                            </p>
                                        ) : null}
                                    </div>
                                    {row.i_may_mute ? (
                                        <Button
                                            variant={row.muted ? "outline" : "ghost"}
                                            size="sm"
                                            className="h-7 shrink-0 px-2 text-xs"
                                            disabled={busy === row.rule_id}
                                            onClick={() =>
                                                void (async () => {
                                                    setBusy(row.rule_id);
                                                    setProblem(null);
                                                    try {
                                                        await door<boolean>("subscription_mute", {
                                                            p_organization_id: organizationId,
                                                            p_rule_id: row.rule_id,
                                                            p_muted: !row.muted,
                                                        });
                                                        await load();
                                                    } catch (error) {
                                                        setProblem(
                                                            error instanceof Error
                                                                ? error.message
                                                                : String(error),
                                                        );
                                                    } finally {
                                                        setBusy(null);
                                                    }
                                                })()
                                            }
                                        >
                                            {row.muted ? "Tell me again" : "Switch it off"}
                                        </Button>
                                    ) : (
                                        // ABSENT, NOT DEAD — no switch at all, and the reason.
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                            Somebody else’s — only they, or an admin of this table, can stop it.
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </TryIt>
            <Aside>
                A notification an agent or a published form switches on really fires and arrives in the bell at
                the top of the window, this list is what you are being told about, and switching one off stops
                it firing everywhere at once. The editor above offers this organization’s own saved views to
                subscribe to.
            </Aside>
        </div>
    );
}
