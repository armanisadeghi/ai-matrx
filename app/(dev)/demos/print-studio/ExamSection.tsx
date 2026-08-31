"use client";

/**
 * The practice-test lane: question booklet, scannable bubble answer sheet,
 * answer key, and explanation sheets.
 * Entry: `@ai-matrx/print/exam`.
 *
 * The four variants each print on their own button rather than through one
 * dialog, because THE ANSWER-SEPARATION LAW is the point of this entry — the
 * units are deliberately separate documents, and a studio that hid them behind
 * a single picker would misrepresent the capability.
 */

import { useState } from "react";
import { ClipboardCheck, FileQuestion, KeyRound, MessageSquareText, Printer } from "lucide-react";
import type { PrintSettings } from "@ai-matrx/print/core";
import { BUBBLE_SHEET_GEOMETRY, practiceTestPrinter, type PracticeTestVariant } from "@ai-matrx/print/exam";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { Field, SectionShell, StatusChip, announcePrintOutcome, controlClass } from "./shared";
import { SAMPLE_PRACTICE_TEST } from "./sample-data";

const VARIANT_ICON: Record<PracticeTestVariant, typeof Printer> = {
    "question-booklet": FileQuestion,
    "bubble-sheet": ClipboardCheck,
    "answer-key": KeyRound,
    explanations: MessageSquareText,
};

const questions = SAMPLE_PRACTICE_TEST.questions;
const multipleChoiceCount = questions.filter((q) => (q.choices?.length ?? 0) > 0).length;
const freeResponseCount = questions.length - multipleChoiceCount;
const totalPoints = questions.reduce((sum, q) => sum + (q.points ?? 0), 0);

export function ExamSection() {
    const [busy, setBusy] = useState<PracticeTestVariant | null>(null);
    const [settings, setSettings] = useState<PrintSettings>({});

    const handlePrint = async (variant: PracticeTestVariant, label: string) => {
        if (busy) return;
        setBusy(variant);
        try {
            const outcome = await practiceTestPrinter.print(SAMPLE_PRACTICE_TEST, variant, settings);
            announcePrintOutcome(outcome, label);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Print failed");
        } finally {
            setBusy(null);
        }
    };

    return (
        <SectionShell
            title="Practice test & bubble sheet"
            entry="@ai-matrx/print/exam"
            blurb="A 12-question sample test as four independently printable documents — booklet, scannable bubble form, key, explanations."
        >
            <StatusChip tone="info" className="mb-3">
                The booklet, the bubble form, and the key are deliberately separate printables: a student prints one
                booklet and a fresh blank bubble form per attempt, and the key never travels with the questions.
            </StatusChip>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                        {SAMPLE_PRACTICE_TEST.title} — {questions.length} questions · {multipleChoiceCount} multiple
                        choice · {freeResponseCount} free response · {totalPoints} points
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{SAMPLE_PRACTICE_TEST.instructions}</p>
                    <ol className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border text-xs">
                        {questions.map((question, index) => (
                            <li key={question.prompt} className="grid grid-cols-[1.75rem_minmax(0,1fr)_7rem] gap-2 px-2 py-1.5">
                                <span className="text-muted-foreground">{index + 1}</span>
                                <span className="min-w-0 truncate text-foreground" title={question.prompt}>
                                    {question.prompt}
                                </span>
                                <span className="text-right text-[11px] text-muted-foreground">
                                    {question.choices?.length
                                        ? `${question.choices.length} choices`
                                        : `free response · ${question.workSpaceLines ?? 0} lines`}
                                    {question.points ? ` · ${question.points} pt` : ""}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                    <div>
                        <p className="text-xs font-medium text-foreground">Print each unit</p>
                        <div className="mt-2 flex flex-col gap-1.5">
                            {practiceTestPrinter.variants.map((variant) => {
                                const id = variant.id as PracticeTestVariant;
                                const Icon = VARIANT_ICON[id] ?? Printer;
                                return (
                                    <div key={variant.id} className="rounded-md border border-border p-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-xs font-medium text-foreground">{variant.label}</p>
                                                {variant.description ? (
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {variant.description}
                                                    </p>
                                                ) : null}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={busy !== null}
                                                onClick={() => void handlePrint(id, variant.label)}
                                            >
                                                <Icon className="mr-1 h-3.5 w-3.5" />
                                                Print
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {practiceTestPrinter.settings?.length ? (
                        <div>
                            <p className="text-xs font-medium text-foreground">Settings</p>
                            <div className="mt-2 flex flex-col gap-2">
                                {practiceTestPrinter.settings.map((setting) => {
                                    if (setting.type === "boolean") {
                                        const checked = Boolean(settings[setting.id] ?? setting.defaultValue);
                                        return (
                                            <label key={setting.id} className="flex items-start gap-2 text-xs">
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5"
                                                    checked={checked}
                                                    onChange={(e) =>
                                                        setSettings((prev) => ({
                                                            ...prev,
                                                            [setting.id]: e.target.checked,
                                                        }))
                                                    }
                                                />
                                                <span className="min-w-0">
                                                    <span className="text-foreground">{setting.label}</span>
                                                    {setting.description ? (
                                                        <span className="block text-[11px] text-muted-foreground">
                                                            {setting.description}
                                                        </span>
                                                    ) : null}
                                                </span>
                                            </label>
                                        );
                                    }
                                    if (setting.type === "number") {
                                        const value = Number(settings[setting.id] ?? setting.defaultValue);
                                        return (
                                            <Field key={setting.id} label={setting.label} hint={setting.description}>
                                                <input
                                                    type="number"
                                                    className={controlClass}
                                                    min={setting.min}
                                                    max={setting.max}
                                                    value={value}
                                                    onChange={(e) =>
                                                        setSettings((prev) => ({
                                                            ...prev,
                                                            [setting.id]: Number(e.target.value),
                                                        }))
                                                    }
                                                />
                                            </Field>
                                        );
                                    }
                                    if (setting.type === "select") {
                                        const value = String(settings[setting.id] ?? setting.defaultValue);
                                        return (
                                            <Field key={setting.id} label={setting.label} hint={setting.description}>
                                                <select
                                                    className={controlClass}
                                                    value={value}
                                                    onChange={(e) =>
                                                        setSettings((prev) => ({
                                                            ...prev,
                                                            [setting.id]: e.target.value,
                                                        }))
                                                    }
                                                >
                                                    {setting.options.map((option) => (
                                                        <option key={option.value} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </Field>
                                        );
                                    }
                                    return (
                                        <div key={setting.id} className="grid grid-cols-2 gap-2">
                                            <Field label={`${setting.label} — from`}>
                                                <input
                                                    type="number"
                                                    className={controlClass}
                                                    min={setting.min}
                                                    value={Number(settings[setting.fromId] ?? setting.defaultFrom)}
                                                    onChange={(e) =>
                                                        setSettings((prev) => ({
                                                            ...prev,
                                                            [setting.fromId]: Number(e.target.value),
                                                        }))
                                                    }
                                                />
                                            </Field>
                                            <Field label="to" hint={setting.description}>
                                                <input
                                                    type="number"
                                                    className={controlClass}
                                                    min={setting.min}
                                                    value={Number(settings[setting.toId] ?? setting.defaultTo)}
                                                    onChange={(e) =>
                                                        setSettings((prev) => ({
                                                            ...prev,
                                                            [setting.toId]: Number(e.target.value),
                                                        }))
                                                    }
                                                />
                                            </Field>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}

                    <StatusChip tone="info">
                        The bubble form is built on inch-exact geometry — {BUBBLE_SHEET_GEOMETRY.rowsPerColumn} rows per
                        column, up to {BUBBLE_SHEET_GEOMETRY.columnsPerPage} columns per page,{" "}
                        {BUBBLE_SHEET_GEOMETRY.bubbleDiameterInches}&quot; circles on a{" "}
                        {BUBBLE_SHEET_GEOMETRY.rowPitchInches}&quot; pitch (the Scantron convention). Each row prints
                        exactly as many bubbles as its question has choices, and free-response rows print a write-in
                        rule instead.
                    </StatusChip>
                    <StatusChip tone="info">
                        There is deliberately no shuffle setting: question and choice order are DATA. Shuffling at print
                        time would silently desynchronize a booklet from a key or form printed in another session.
                    </StatusChip>
                </div>
            </div>
        </SectionShell>
    );
}
