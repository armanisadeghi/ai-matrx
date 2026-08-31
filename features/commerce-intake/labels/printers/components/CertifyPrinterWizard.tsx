"use client";

/**
 * CertifyPrinterWizard — the guided printer certification.
 *
 * The platform SHIPS officially-supported printer recommendations (Brother
 * QL-810W, DYMO LW550, Zebra ZD410). This wizard is how an admin certifies
 * ANY OTHER printer against one label stock, and it is built as a guided
 * session: one screen at a time, saying what to click, what to look for, what
 * to do, and what to report.
 *
 * 1. Pick the printer and the label stock (calibration preview shown).
 * 2. Print the calibration page — the exact print-dialog settings are named
 *    on screen, because "100% scale, margins none" IS the test.
 * 3. Answer four physical yes/no checks about the page in your hand.
 * 4. Verdict → the row is written with an EXPLICIT organization_id from the
 *    active org context (never a fallback), the answers in result_notes.
 *
 * A failure is not a dead end: it offers the same printer against a different
 * stock, which is the actual remedy most of the time.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  Loader2,
  Printer,
  RotateCcw,
  Ruler,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@ai-matrx/design-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notifyPrintOutcome } from "@/lib/print/print-outcome-toast";
import { toast } from "@/lib/toast";
import {
  LABEL_TEMPLATES,
  getLabelTemplate,
  printCalibrationSheet,
} from "@ai-matrx/print/labels";
import { LabelSheetPreview } from "@ai-matrx/print/react";

import {
  loadCertifiedPrinter,
  recordCertification,
} from "../service";
import {
  CERTIFICATION_CHECKS,
  CERTIFIED_PRINTERS_HREF,
  formatCertificationStatus,
  type CertificationResultNotes,
  type CertificationStatus,
} from "../types";

const DEFAULT_TEMPLATE_ID = "avery-5163";

type Step = 1 | 2 | 3 | 4;

function StepHeading({
  step,
  title,
  subtitle,
}: {
  step: Step;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

export function CertifyPrinterWizard({
  organizationId,
  userId,
  existingId,
}: {
  /** EXPLICIT active-org id — the write refuses without it. */
  organizationId: string | null;
  userId: string | null;
  existingId?: string;
}) {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [connectionNote, setConnectionNote] = useState("");
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [printed, setPrinted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [verdict, setVerdict] = useState<CertificationStatus | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(existingId));
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);

  // Re-check lane: prefill from the stored row, then walk the same steps.
  useEffect(() => {
    if (!existingId) return;
    let cancelled = false;
    void (async () => {
      try {
        const row = await loadCertifiedPrinter(existingId);
        if (cancelled || !row) return;
        setMake(row.printerMake);
        setModel(row.printerModel);
        setConnectionNote(row.connectionNote ?? "");
        setTemplateId(row.templateId);
        setPreviousStatus(row.status);
      } catch (err) {
        console.error("[certified-printers] load for re-check failed", err);
        toast.error("Could not load that certification.");
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [existingId]);

  const template = useMemo(
    () => getLabelTemplate(templateId) ?? LABEL_TEMPLATES[0],
    [templateId],
  );

  const printerName = `${make.trim()} ${model.trim()}`.trim();
  const canDescribe = make.trim().length > 0 && model.trim().length > 0;
  const allAnswered = CERTIFICATION_CHECKS.every(
    (c) => typeof answers[c.id] === "boolean",
  );
  const passed = CERTIFICATION_CHECKS.every((c) => answers[c.id] === true);

  const printCalibration = useCallback(() => {
    try {
      const outcome = printCalibrationSheet(template);
      notifyPrintOutcome(outcome);
      setPrinted(true);
    } catch (err) {
      console.error("[certified-printers] calibration print failed", err);
      toast.error("Could not open the print window.");
    }
  }, [template]);

  const save = useCallback(async () => {
    if (!organizationId) {
      toast.error(
        "No organization is selected — pick an organization before certifying a printer.",
      );
      return;
    }
    if (!userId) {
      toast.error("You are signed out — sign in again to record this result.");
      return;
    }
    setSaving(true);
    const status: CertificationStatus = passed ? "certified" : "failed";
    const notes: CertificationResultNotes = {
      answers,
      template_id: template.id,
      template_name: template.name,
      stock_code: template.stockCode,
      questions: CERTIFICATION_CHECKS.map((c) => ({
        id: c.id,
        question: c.question(template),
        answer: answers[c.id] === true,
      })),
      answered_at: new Date().toISOString(),
    };
    try {
      await recordCertification({
        organizationId,
        certifiedBy: userId,
        printerMake: make.trim(),
        printerModel: model.trim(),
        connectionNote: connectionNote.trim() || null,
        templateId: template.id,
        status,
        resultNotes: notes,
        existingId,
      });
      setVerdict(status);
      setStep(4);
    } catch (err) {
      console.error("[certified-printers] record failed", err);
      toast.error(
        err instanceof Error ? err.message : "Could not save the result.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    answers,
    connectionNote,
    existingId,
    make,
    model,
    organizationId,
    passed,
    template,
    userId,
  ]);

  const tryAnotherStock = () => {
    setAnswers({});
    setPrinted(false);
    setVerdict(null);
    setStep(1);
  };

  if (loadingExisting) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pb-safe">
      {existingId && previousStatus && (
        <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Re-checking <span className="font-medium text-foreground">{printerName}</span> on{" "}
          <span className="font-medium text-foreground">{template.name}</span>. Its last
          recorded result was{" "}
          <Badge variant="outline" className="py-0 text-[10px]">
            {formatCertificationStatus(previousStatus)}
          </Badge>
          . Saving replaces it.
        </div>
      )}

      {/* ── Step 1 — the printer and the stock ─────────────────────────── */}
      {step === 1 && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <StepHeading
            step={1}
            title="Which printer, and which labels?"
            subtitle="Name the printer the way it appears in your print dialog, and pick the label stock you actually load into it."
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="printer-make">Make</Label>
              <Input
                id="printer-make"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder="Brother"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="printer-model">Model</Label>
              <Input
                id="printer-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="QL-1110NWB"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="printer-connection">
              How is it connected? (optional)
            </Label>
            <Input
              id="printer-connection"
              value={connectionNote}
              onChange={(e) => setConnectionNote(e.target.value)}
              placeholder="USB to the warehouse PC · driver v1.4 · queue name 'BR-QL1110'"
            />
            <p className="text-[11px] text-muted-foreground">
              Anything the next person needs to reach the same printer — cable,
              network name, driver, queue.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="printer-stock">Label stock</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="printer-stock">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LABEL_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} — {t.stockCode}
                    {t.kind === "roll" ? " (roll)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              A certification is for one printer on one stock. The same printer
              can be certified again on other stock.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-background p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              This is what will print — {template.name} ·{" "}
              {template.kind === "roll"
                ? `${template.labelWIn}" × ${template.labelHIn}" roll label`
                : `${template.cols * template.rows} labels on a ${template.sheetWIn}" × ${template.sheetHIn}" sheet`}
            </p>
            <LabelSheetPreview template={template} labels={[]} calibration />
          </div>

          <div className="flex justify-end">
            <Button disabled={!canDescribe} onClick={() => setStep(2)}>
              Next — print the calibration page
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2 — print it ──────────────────────────────────────────── */}
      {step === 2 && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <StepHeading
            step={2}
            title="Print the calibration page"
            subtitle={`On ${printerName || "your printer"}, on plain paper — not on your labels. You will hold the printed page against the label stock in the next step.`}
          />

          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold text-foreground">
              Set these in the print dialog before you press Print — these
              settings ARE the test
            </p>
            <ul className="mt-1.5 flex flex-col gap-1 text-xs text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Printer:</span>{" "}
                {printerName || "the printer you are certifying"}
              </li>
              <li>
                <span className="font-medium text-foreground">Scale:</span> 100%
                — never &ldquo;Fit to page&rdquo; or &ldquo;Shrink to fit&rdquo;
              </li>
              <li>
                <span className="font-medium text-foreground">Margins:</span>{" "}
                None
              </li>
              <li>
                <span className="font-medium text-foreground">Paper size:</span>{" "}
                {template.kind === "roll"
                  ? `${template.labelWIn}" × ${template.labelHIn}" (the roll label size)`
                  : `${template.sheetWIn}" × ${template.sheetHIn}" (Letter)`}
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Headers and footers:
                </span>{" "}
                off · <span className="font-medium text-foreground">Two-sided:</span>{" "}
                off
              </li>
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={printCalibration}>
              <Ruler className="mr-1.5 h-4 w-4" />
              Print the calibration page
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Opens your browser&rsquo;s print dialog and prints one page.
            </span>
          </div>

          {printed && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Print window opened. Printed nothing? Press the button again — you
              can print as many times as you need before answering.
            </p>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            <Button disabled={!printed} onClick={() => setStep(3)}>
              I have the printed page — check it
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3 — the four physical checks ──────────────────────────── */}
      {step === 3 && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <StepHeading
            step={3}
            title="Look at the printed page"
            subtitle={`Hold it against your ${template.stockCode} stock and answer four questions. Every answer must be Yes for ${printerName} to be certified.`}
          />

          <div className="flex flex-col gap-2">
            {CERTIFICATION_CHECKS.map((check, index) => {
              const value = answers[check.id];
              return (
                <div
                  key={check.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {index + 1}. {check.question(template)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {check.hint(template)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant={value === true ? "default" : "outline"}
                      onClick={() =>
                        setAnswers((a) => ({ ...a, [check.id]: true }))
                      }
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Yes
                    </Button>
                    <Button
                      size="sm"
                      variant={value === false ? "destructive" : "outline"}
                      onClick={() =>
                        setAnswers((a) => ({ ...a, [check.id]: false }))
                      }
                    >
                      <X className="mr-1 h-4 w-4" />
                      No
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {allAnswered && !passed && (
            <p className="text-xs text-muted-foreground">
              At least one check is a No, so this will be recorded as{" "}
              <span className="font-medium text-destructive">Failed</span> — a
              real, useful result. You can try the same printer on a different
              stock right after saving.
            </p>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(2)}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
            <Button disabled={!allAnswered || saving} onClick={() => void save()}>
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : passed ? (
                "Record — certified"
              ) : (
                "Record — failed"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4 — the verdict ───────────────────────────────────────── */}
      {step === 4 && verdict && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <StepHeading
            step={4}
            title={
              verdict === "certified"
                ? `${printerName} is certified for ${template.name}`
                : `${printerName} failed on ${template.name}`
            }
            subtitle={
              verdict === "certified"
                ? "Recorded for your whole team. Anyone printing labels on this stock can now trust this printer."
                : "Recorded, with your answers, so nobody has to repeat the test to learn it does not work."
            }
          />

          <div className="rounded-lg border border-border bg-background p-3">
            <ul className="flex flex-col gap-1 text-xs">
              {CERTIFICATION_CHECKS.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  {answers[c.id] ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  )}
                  <span className="text-muted-foreground">
                    {c.question(template)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => router.push(CERTIFIED_PRINTERS_HREF)}>
              <Printer className="mr-1.5 h-4 w-4" />
              See all certified printers
            </Button>
            <Button variant="outline" onClick={tryAnotherStock}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {verdict === "certified"
                ? "Certify this printer on another stock"
                : "Try a different label stock"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
