"use client";

// features/education/classes/components/ClassFormDialog.tsx
//
// One dialog for BOTH creating and editing a class (a class = a scope). Exam
// dates + teacher/term/period live in scope.settings — this is the only editor
// of a class's shape. No browser dialogs; semantic colors; Lucide only.

import { useState } from "react";
import { CalendarClock, Plus, Trash2, GraduationCap } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AccessModeField } from "./AccessModeField";
import { DEFAULT_ACCESS_MODE } from "../constants";
import type {
  AccessMode,
  ClassExamDate,
  ClassSettings,
  StudyClass,
} from "../types";

export interface ClassFormValue {
  name: string;
  description: string;
  settings: ClassSettings;
}

interface ClassFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode; absent → create mode. */
  initial?: StudyClass;
  onSubmit: (value: ClassFormValue) => Promise<void>;
}

function makeExamId(): string {
  return `exam-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ClassFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: ClassFormDialogProps) {
  const isEdit = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [teacher, setTeacher] = useState(initial?.settings.teacher ?? "");
  const [term, setTerm] = useState(initial?.settings.term ?? "");
  const [period, setPeriod] = useState(initial?.settings.period ?? "");
  const [examDates, setExamDates] = useState<ClassExamDate[]>(
    initial?.settings.examDates ?? [],
  );
  const [accessMode, setAccessMode] = useState<AccessMode>(
    initial?.settings.accessMode ?? DEFAULT_ACCESS_MODE,
  );
  // Price is edited in DOLLARS; persisted as integer cents in scope.settings.
  const [price, setPrice] = useState(
    initial?.settings.priceCents ? String(initial.settings.priceCents / 100) : "",
  );
  const [busy, setBusy] = useState(false);

  function addExam() {
    setExamDates((rows) => [
      ...rows,
      { id: makeExamId(), title: "", date: "" },
    ]);
  }
  function patchExam(id: string, patch: Partial<ClassExamDate>) {
    setExamDates((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }
  function removeExam(id: string) {
    setExamDates((rows) => rows.filter((r) => r.id !== id));
  }

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give your class a name.");
      return;
    }
    const cleanExams = examDates
      .map((e) => ({ ...e, title: e.title.trim() }))
      .filter((e) => e.title && e.date);
    // Dollars → cents. Guard the $1.00 floor for a paid class (Stripe's charge
    // minimum + a clean whole-cent 20% fee).
    const priceCents =
      accessMode === "paid" ? Math.round(Number(price) * 100) : undefined;
    if (accessMode === "paid" && (!priceCents || priceCents < 100)) {
      toast.error("Set a price of at least $1.00 for a paid class.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        name: trimmed,
        description: description.trim(),
        settings: {
          examDates: cleanExams,
          teacher: teacher.trim() || undefined,
          term: term.trim() || undefined,
          period: period.trim() || undefined,
          color: initial?.settings.color,
          archived: initial?.settings.archived,
          accessMode,
          priceCents,
        },
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not save the class.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            {isEdit ? "Edit class" : "New class"}
          </DialogTitle>
          <DialogDescription>
            A class gathers the decks, quizzes, notes, media, and exam dates for
            one course.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="class-name">Class name</Label>
            <Input
              id="class-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="AP Biology, Period 3"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="class-teacher">Teacher</Label>
              <Input
                id="class-teacher"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                placeholder="Ms. Rivera"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="class-term">Term</Label>
              <Input
                id="class-term"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Fall 2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="class-period">Period</Label>
              <Input
                id="class-period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="3"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="class-desc">Description</Label>
            <Textarea
              id="class-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — what this course covers."
              rows={2}
            />
          </div>

          <AccessModeField value={accessMode} onChange={setAccessMode} />

          {accessMode === "paid" && (
            <div className="space-y-1.5">
              <Label htmlFor="class-price">Enrolment price (USD)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  id="class-price"
                  type="number"
                  min="1"
                  step="0.01"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="29"
                  className="w-32"
                />
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Students pay this once for full access. You keep 80%; the platform
                fee is 20%. Payouts require connecting Stripe on your creator page.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                Exam dates
              </Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={addExam}
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            {examDates.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Add midterms, unit tests, and finals — they show on the hub and
                you can plan around them.
              </p>
            ) : (
              <div className="space-y-2">
                {examDates.map((exam) => (
                  <div key={exam.id} className="flex items-center gap-2">
                    <Input
                      value={exam.title}
                      onChange={(e) =>
                        patchExam(exam.id, { title: e.target.value })
                      }
                      placeholder="Midterm"
                      className="flex-1"
                    />
                    <Input
                      type="date"
                      value={exam.date}
                      onChange={(e) =>
                        patchExam(exam.id, { date: e.target.value })
                      }
                      className="w-40"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeExam(exam.id)}
                      aria-label="Remove exam date"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create class"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
