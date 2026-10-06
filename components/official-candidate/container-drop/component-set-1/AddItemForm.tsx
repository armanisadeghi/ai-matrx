"use client";

import React, { useState, useRef } from "react";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { useContainerDropContext } from "../ContainerDropProvider";
import { ICON_MAP, ICON_OPTIONS, COLOR_OPTIONS, resolveColor } from "./presets";

interface AddItemFormProps {
  className?: string;
  buttonLabel?: string;
}

export function AddItemForm({ className, buttonLabel }: AddItemFormProps) {
  const { addItem } = useContainerDropContext();
  const [label, setLabel] = useState("");
  const [iconName, setIconName] = useState("Briefcase");
  const [color, setColor] = useState("blue");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    addItem({
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: trimmed,
      iconName,
      color,
    });
    setLabel("");
    inputRef.current?.focus();
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary ${className ?? ""}`}
      >
        <Plus className="h-4 w-4" />
        {buttonLabel ?? "Add Item"}
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className={`flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 ${className ?? ""}`}
    >
      <div className="min-w-[140px] flex-1">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Label
        </label>
        <input
          ref={inputRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Item name..."
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          style={{ fontSize: "16px" }}
          autoFocus
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Icon
        </label>
        <div className="flex gap-1">
          {ICON_OPTIONS.map((name) => {
            const Ico = ICON_MAP[name];
            return (
              <button
                key={name}
                onClick={() => setIconName(name)}
                className={`rounded-md p-1.5 transition-colors ${
                  iconName === name
                    ? "bg-primary/10 text-primary-ink ring-1 ring-primary/30"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Ico className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Color
        </label>
        <div className="flex gap-1">
          {COLOR_OPTIONS.map((c) => {
            const tokens = resolveColor(c);
            return (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border-2 transition-transform ${tokens.bg} ${
                  color === c
                    ? `scale-110 ${tokens.border} ring-2 ${tokens.ring}`
                    : "border-transparent"
                }`}
              />
            );
          })}
        </div>
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={handleSubmit}
          disabled={!label.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
        >
          Add
        </button>
        <button
          onClick={() => setIsOpen(false)}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}
