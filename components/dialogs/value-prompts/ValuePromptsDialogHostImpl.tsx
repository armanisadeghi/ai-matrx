/**
 * components/dialogs/value-prompts/ValuePromptsDialogHostImpl.tsx
 *
 * Heavy implementation of the global value-prompts dialog host. Mounted
 * lazily by `ValuePromptsDialogHost.tsx` via `next/dynamic({ ssr: false })`.
 *
 * Imperative model (mirrors ConfirmDialogHostImpl): `promptForValues(...)`
 * calls push requests onto a ref-backed queue; this component drains one at
 * a time and renders a single dialog with one input per field. Submit
 * resolves `{ name: answer }`; dismiss resolves `null` — but dismissal is
 * blocked while any field is `required` (per the ValueMapping contract:
 * "the user cannot cancel; submit is the only way out").
 */

"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  _registerHost,
  _unregisterHost,
  type ValuePromptsRequest,
} from "./valuePromptsOpener";

interface ActiveRequest {
  req: ValuePromptsRequest;
  resolve: (answers: Record<string, string> | null) => void;
}

function initialAnswers(req: ValuePromptsRequest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of req.fields) {
    out[f.name] =
      f.defaultValue === undefined || f.defaultValue === null
        ? ""
        : String(f.defaultValue);
  }
  return out;
}

export default function ValuePromptsDialogHostImpl() {
  const [active, setActive] = React.useState<ActiveRequest | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [tick, setTick] = React.useState(0);
  const queueRef = React.useRef<ActiveRequest[]>([]);

  React.useEffect(() => {
    const controller = {
      show: (
        req: ValuePromptsRequest,
        resolve: (answers: Record<string, string> | null) => void,
      ) => {
        queueRef.current.push({ req, resolve });
        setTick((n) => n + 1);
      },
    };
    _registerHost(controller);
    return () => _unregisterHost(controller);
  }, []);

  React.useEffect(() => {
    if (active === null && queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      setAnswers(initialAnswers(next.req));
      setActive(next);
    }
  }, [active, tick]);

  const hasRequired = !!active?.req.fields.some((f) => f.required);
  const missingRequired = !!active?.req.fields.some(
    (f) => f.required && !(answers[f.name] ?? "").trim(),
  );

  const handleSubmit = React.useCallback(() => {
    if (!active || missingRequired) return;
    active.resolve(answers);
    setActive(null);
  }, [active, answers, missingRequired]);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (open || !active) return;
      // Required fields lock the dialog open — re-render keeps it visible.
      if (hasRequired) return;
      active.resolve(null);
      setActive(null);
    },
    [active, hasRequired],
  );

  return (
    <Dialog open={!!active} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          if (hasRequired) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (hasRequired) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{active?.req.title ?? ""}</DialogTitle>
          <DialogDescription>
            This action needs a few values from you before it runs.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-1">
          {active?.req.fields.map((field) => (
            <div key={field.name} className="flex flex-col gap-1.5">
              <Label
                htmlFor={`value-prompt-${field.name}`}
                className="text-sm text-foreground"
              >
                {field.prompt}
                {field.required && (
                  <span className="ml-1 text-destructive">*</span>
                )}
              </Label>
              <Textarea
                id={`value-prompt-${field.name}`}
                value={answers[field.name] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({
                    ...prev,
                    [field.name]: e.target.value,
                  }))
                }
                rows={2}
                className="min-h-9 resize-y text-base md:text-sm"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          {!hasRequired && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!active) return;
                active.resolve(null);
                setActive(null);
              }}
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={missingRequired}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
