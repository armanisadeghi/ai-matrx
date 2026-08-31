"use client";

/**
 * The education / test-prep artifact library — the three printers a student
 * actually gets handed: a dense one-pager, a vocabulary list, and a week-by-week
 * study plan.
 *
 * Entry: `@ai-matrx/print/education` (+ the real `PrintOptionsDialog`, so the
 * variant picker and every declared setting are the package's own, not a
 * studio re-implementation).
 *
 * ONE content source → MANY layouts chosen at print time: switching the
 * sub-pick below changes the printer, never the data.
 */

import { useState } from "react";
import { CalendarDays, ListTree, Printer, Rows3 } from "lucide-react";
import type { BlockPrinter } from "@ai-matrx/print/core";
import { cheatSheetPrinter, glossaryPrinter, studyCalendarPrinter } from "@ai-matrx/print/education";
import { PrintOptionsDialog, usePrintOptions } from "@ai-matrx/print/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { toast } from "@/lib/toast";
import { SectionShell, StatusChip, announcePrintOutcome } from "./shared";
import { SAMPLE_CHEAT_SHEET, SAMPLE_GLOSSARY, SAMPLE_STUDY_CALENDAR } from "./sample-data";

type ArtifactId = "cheat-sheet" | "glossary" | "study-calendar";

const ARTIFACTS = [
    {
        id: "cheat-sheet" as const,
        label: "Cheat sheet",
        icon: Rows3,
        printer: cheatSheetPrinter,
        data: SAMPLE_CHEAT_SHEET,
        printLabel: "Cheat sheet",
        summary: `${SAMPLE_CHEAT_SHEET.sections.length} sections · ${SAMPLE_CHEAT_SHEET.sections.reduce((n, s) => n + s.items.length, 0)} entries`,
        note: "Density WITH hierarchy — every section is a break-safe block inside the column flow, so a heading never strands at the bottom of a column. Formulas are boxed so the eye finds them without reading the prose.",
    },
    {
        id: "glossary" as const,
        label: "Glossary",
        icon: ListTree,
        printer: glossaryPrinter,
        data: SAMPLE_GLOSSARY,
        printLabel: "Glossary",
        summary: `${SAMPLE_GLOSSARY.entries.length} entries`,
        note: "The mastered checkbox is drawn in CSS, never a font glyph — a print window loads no webfonts, and tofu on the one box the student is supposed to tick is a failed artifact.",
    },
    {
        id: "study-calendar" as const,
        label: "Study calendar",
        icon: CalendarDays,
        printer: studyCalendarPrinter,
        data: SAMPLE_STUDY_CALENDAR,
        printLabel: "Study calendar",
        summary: `${SAMPLE_STUDY_CALENDAR.weeks.length} weeks · ${SAMPLE_STUDY_CALENDAR.weeks.reduce((n, w) => n + w.days.length, 0)} days`,
        note: "Milestones print as banners across the week they land in, so the plan reads as a shape rather than a list of chores.",
    },
] satisfies readonly {
    id: ArtifactId;
    label: string;
    icon: typeof Rows3;
    printer: BlockPrinter;
    data: unknown;
    printLabel: string;
    summary: string;
    note: string;
}[];

/** The printer's own variants + settings, listed so the contract is visible without opening the dialog. */
function PrinterContract({ printer }: { printer: BlockPrinter }) {
    return (
        <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">
                {printer.variants.length} variants · {printer.settings?.length ?? 0} settings
            </p>
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border text-xs">
                {printer.variants.map((variant) => (
                    <li key={variant.id} className="px-2 py-1.5">
                        <span className="font-medium text-foreground">{variant.label}</span>
                        <code className="ml-1.5 font-mono text-[11px] text-muted-foreground">{variant.id}</code>
                        {variant.description ? (
                            <p className="text-[11px] text-muted-foreground">{variant.description}</p>
                        ) : null}
                    </li>
                ))}
            </ul>
            {printer.settings?.length ? (
                <ul className="mt-2 flex flex-wrap gap-1">
                    {printer.settings.map((setting) => (
                        <li
                            key={setting.id}
                            className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                        >
                            {setting.id}
                            <span className="ml-1 font-sans text-[10px] uppercase tracking-wide">{setting.type}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

function CheatSheetPreview() {
    return (
        <div className="min-w-0 space-y-2">
            <p className="text-xs font-medium text-foreground">{SAMPLE_CHEAT_SHEET.title}</p>
            <p className="text-[11px] text-muted-foreground">{SAMPLE_CHEAT_SHEET.subtitle}</p>
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {SAMPLE_CHEAT_SHEET.sections.map((section) => (
                    <div key={section.heading} className="px-2 py-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {section.heading}
                        </p>
                        <ul className="mt-1 space-y-0.5 text-xs">
                            {section.items.map((item) => (
                                <li key={item.term} className="flex flex-wrap items-baseline gap-1.5">
                                    <span className="text-foreground">{item.term}</span>
                                    {item.formula ? (
                                        <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">
                                            {item.formula}
                                        </code>
                                    ) : null}
                                    {item.definition ? (
                                        <span className="text-[11px] text-muted-foreground">{item.definition}</span>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
}

function GlossaryPreview() {
    return (
        <div className="min-w-0 space-y-2">
            <p className="text-xs font-medium text-foreground">
                {SAMPLE_GLOSSARY.title} — {SAMPLE_GLOSSARY.entries.length} entries
            </p>
            <ol className="divide-y divide-border overflow-hidden rounded-md border border-border text-xs">
                {SAMPLE_GLOSSARY.entries.map((entry, index) => (
                    <li key={entry.term} className="grid grid-cols-[1.5rem_10rem_minmax(0,1fr)] gap-2 px-2 py-1.5">
                        <span className="text-muted-foreground">{index + 1}</span>
                        <span className="text-foreground">{entry.term}</span>
                        <span className="text-muted-foreground">{entry.definition}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function StudyCalendarPreview() {
    return (
        <div className="min-w-0 space-y-2">
            <p className="text-xs font-medium text-foreground">{SAMPLE_STUDY_CALENDAR.title}</p>
            <p className="text-[11px] text-muted-foreground">{SAMPLE_STUDY_CALENDAR.subtitle}</p>
            <div className="space-y-2">
                {SAMPLE_STUDY_CALENDAR.weeks.map((week) => (
                    <div key={week.label} className="overflow-hidden rounded-md border border-border">
                        <p className="bg-muted/60 px-2 py-1 text-[11px] font-semibold text-foreground">{week.label}</p>
                        <ul className="divide-y divide-border text-xs">
                            {week.days.map((day) => (
                                <li key={day.label} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2 px-2 py-1">
                                    <span className="text-muted-foreground">{day.label}</span>
                                    <span className="min-w-0">
                                        <span className="text-foreground">{day.tasks.join(" · ")}</span>
                                        {day.milestone ? (
                                            <span className="mt-0.5 block text-[11px] font-medium text-amber-700 dark:text-amber-400">
                                                {day.milestone}
                                            </span>
                                        ) : null}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function EducationSection() {
    const [artifactId, setArtifactId] = useState<ArtifactId>("cheat-sheet");
    const artifact = ARTIFACTS.find((a) => a.id === artifactId) ?? ARTIFACTS[0];

    const { open, setOpen, triggerPrint } = usePrintOptions(artifact.printer, artifact.data, (outcome) =>
        announcePrintOutcome(outcome, artifact.printLabel),
    );

    const handlePrint = () => {
        void triggerPrint().catch((err: unknown) => {
            toast.error(err instanceof Error ? err.message : "Print failed");
        });
    };

    return (
        <SectionShell
            title="Education artifacts"
            entry="@ai-matrx/print/education"
            blurb="Cheat sheet, glossary, and study calendar — one content source, many layouts picked at print time."
            actions={
                <Button size="sm" onClick={handlePrint}>
                    <Printer className="mr-1 h-3.5 w-3.5" />
                    Print {artifact.label.toLowerCase()}
                </Button>
            }
        >
            <div className="mb-4 flex flex-wrap gap-1 rounded-md border border-border bg-muted/40 p-1">
                {ARTIFACTS.map(({ id, label, icon: Icon, summary }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setArtifactId(id)}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                            artifactId === id
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                        <span className="font-normal text-[10px] text-muted-foreground">{summary}</span>
                    </button>
                ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {artifactId === "cheat-sheet" ? <CheatSheetPreview /> : null}
                {artifactId === "glossary" ? <GlossaryPreview /> : null}
                {artifactId === "study-calendar" ? <StudyCalendarPreview /> : null}

                <div className="flex min-w-0 flex-col gap-2">
                    <PrinterContract printer={artifact.printer} />
                    <StatusChip tone="info">{artifact.note}</StatusChip>
                </div>
            </div>

            <PrintOptionsDialog
                printer={artifact.printer}
                data={artifact.data}
                open={open}
                onOpenChange={setOpen}
                onPrinted={(outcome) => announcePrintOutcome(outcome, artifact.printLabel)}
            />
        </SectionShell>
    );
}
