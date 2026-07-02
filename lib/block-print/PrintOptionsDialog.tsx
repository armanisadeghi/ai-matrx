"use client";

import React, { useState, useMemo } from "react";
import { Printer, X, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import type {
  BlockPrinter,
  PrintSettings,
  PrintSetting,
} from "@/lib/block-print/block-print-utils";

interface PrintOptionsDialogProps {
  printer: BlockPrinter;
  data: unknown;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDefaultSettings(settings: PrintSetting[]): PrintSettings {
  const out: PrintSettings = {};
  for (const s of settings) {
    if (s.type === "boolean") {
      out[s.id] = s.defaultValue;
    } else if (s.type === "range") {
      out[s.fromId] = s.defaultFrom;
      out[s.toId] = s.defaultTo;
    }
  }
  return out;
}

function visibleSettings(
  settings: PrintSetting[],
  variantId: string,
): PrintSetting[] {
  return settings.filter(
    (s) => !s.appliesTo || s.appliesTo.includes(variantId),
  );
}

// ─── Inner content (shared between Dialog and Drawer) ─────────────────────────

function PrintOptionsContent({
  printer,
  data,
  onClose,
}: {
  printer: BlockPrinter;
  data: unknown;
  onClose: () => void;
}) {
  // MATRX-EXCEPTION: React state initializer — "" (no variant selected) when
  // the printer declares zero variants; pure UI default, not a boundary write.
  const [selectedVariant, setSelectedVariant] = useState<string>(
    printer.variants[0]?.id ?? "",
  );
  const [isPrinting, setIsPrinting] = useState(false);

  const allSettings = printer.settings ?? [];

  // Initialize from defaults once
  const [settingValues, setSettingValues] = useState<PrintSettings>(() =>
    buildDefaultSettings(allSettings),
  );

  // Settings visible for the currently selected variant
  const currentSettings = useMemo(
    () => visibleSettings(allSettings, selectedVariant),
    [allSettings, selectedVariant],
  );

  const toggleSetting = (id: string) => {
    setSettingValues((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setNumberSetting = (id: string, value: number) => {
    setSettingValues((prev) => ({ ...prev, [id]: value }));
  };

  const handlePrint = async (variantId?: string, useDefaults = false) => {
    setIsPrinting(true);
    try {
      const settings = useDefaults
        ? buildDefaultSettings(allSettings)
        : settingValues;
      await printer.print(data, variantId, settings);
    } finally {
      setIsPrinting(false);
      onClose();
    }
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* ── Scrollable body: variant list + settings ── */}
      <div className="flex-1 overflow-y-auto min-h-0 py-2 space-y-4">
        {/* Variant picker */}
        {printer.variants.length > 0 && (
          <div>
            <p className="text-sm font-medium text-foreground mb-2 px-0.5">
              Print format
            </p>
            <div className="space-y-1.5">
              {printer.variants.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() => setSelectedVariant(variant.id)}
                  className={`w-full flex flex-col items-start px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    selectedVariant === variant.id
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-background hover:bg-accent"
                  }`}
                >
                  <span className="text-sm font-medium">{variant.label}</span>
                  {variant.description && (
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {variant.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Settings toggles — only shown when there are settings for this variant */}
        {currentSettings.length > 0 && (
          <div>
            <p className="text-sm font-medium text-foreground mb-2 px-0.5 flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5" />
              Options
            </p>
            <div className="space-y-1">
              {currentSettings.map((setting) => {
                if (setting.type === "boolean") {
                  const checked = settingValues[setting.id] === true;
                  return (
                    <button
                      key={setting.id}
                      onClick={() => toggleSetting(setting.id)}
                      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-accent text-left transition-colors"
                    >
                      {/* Custom checkbox */}
                      <span
                        className={`mt-0.5 shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                          checked
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {checked && (
                          <svg
                            className="w-2.5 h-2.5 text-primary-foreground"
                            viewBox="0 0 10 10"
                            fill="none"
                          >
                            <path
                              d="M1.5 5l2.5 2.5 4.5-4.5"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-foreground">
                          {setting.label}
                        </span>
                        {setting.description && (
                          <span className="text-xs text-muted-foreground mt-0.5">
                            {setting.description}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                }

                if (setting.type === "range") {
                  const min = setting.min ?? 0;
                  const fromVal =
                    (settingValues[setting.fromId] as number | undefined) ?? 0;
                  const toVal =
                    (settingValues[setting.toId] as number | undefined) ?? 0;
                  const parse = (raw: string) => {
                    if (raw === "") return 0;
                    const n = parseInt(raw, 10);
                    return Number.isNaN(n) ? 0 : Math.max(min, n);
                  };
                  return (
                    <div
                      key={setting.id}
                      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border bg-background"
                    >
                      <span className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground">
                          {setting.label}
                        </span>
                        {setting.description && (
                          <span className="text-xs text-muted-foreground mt-0.5">
                            {setting.description}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={min}
                          value={fromVal === 0 ? "" : fromVal}
                          onChange={(e) =>
                            setNumberSetting(
                              setting.fromId,
                              parse(e.target.value),
                            )
                          }
                          placeholder={setting.fromPlaceholder ?? "start"}
                          aria-label={`${setting.label} — from`}
                          className="w-14 h-7 text-xs text-center rounded border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-xs text-muted-foreground">
                          to
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={min}
                          value={toVal === 0 ? "" : toVal}
                          onChange={(e) =>
                            setNumberSetting(
                              setting.toId,
                              parse(e.target.value),
                            )
                          }
                          placeholder={setting.toPlaceholder ?? "end"}
                          aria-label={`${setting.label} — to`}
                          className="w-14 h-7 text-xs text-center rounded border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Action buttons — always pinned at bottom ── */}
      <div className="flex flex-col gap-2 pt-3 pb-1 border-t border-border mt-2 shrink-0">
        <Button
          onClick={() => handlePrint(selectedVariant || undefined)}
          disabled={isPrinting}
          className="w-full"
        >
          <Printer className="w-4 h-4 mr-2" />
          {isPrinting ? "Opening print view..." : "Print / Save PDF"}
        </Button>
        {printer.variants.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handlePrint(undefined, true)}
            disabled={isPrinting}
            className="w-full text-muted-foreground text-xs"
          >
            Print with defaults
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

/**
 * Shared pre-print options UI — shown when a BlockPrinter has variants or settings.
 * Desktop: Dialog. Mobile: Drawer (bottom sheet).
 */
export function PrintOptionsDialog({
  printer,
  data,
  open,
  onOpenChange,
}: PrintOptionsDialogProps) {
  const isMobile = useIsMobile();
  const handleClose = () => onOpenChange(false);

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="flex flex-col max-h-[85dvh]">
          <DrawerHeader className="flex items-center justify-between pb-2 shrink-0">
            <DrawerTitle className="flex items-center gap-2">
              <Printer className="w-4 h-4" />
              {printer.label}
            </DrawerTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-7 w-7"
            >
              <X className="w-4 h-4" />
            </Button>
          </DrawerHeader>
          <div className="flex flex-col min-h-0 flex-1 overflow-hidden px-4 pb-4">
            <PrintOptionsContent
              printer={printer}
              data={data}
              onClose={handleClose}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm flex flex-col max-h-[85dvh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-4 h-4" />
            {printer.label}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Choose a print format and options for this content.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <PrintOptionsContent
            printer={printer}
            data={data}
            onClose={handleClose}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages open state for PrintOptionsDialog.
 * If the printer has variants or settings, shows the dialog.
 * If it has neither, calls printer.print() immediately with no settings.
 */
export function usePrintOptions(printer: BlockPrinter | null, data: unknown) {
  const [open, setOpen] = useState(false);

  const triggerPrint = async () => {
    if (!printer) return;
    const hasOptions =
      printer.variants.length > 0 || (printer.settings?.length ?? 0) > 0;
    if (!hasOptions) {
      await printer.print(data);
    } else {
      setOpen(true);
    }
  };

  return { open, setOpen, triggerPrint };
}
