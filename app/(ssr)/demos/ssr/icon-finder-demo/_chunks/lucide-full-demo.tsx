"use client";

import { useState } from "react";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Demo chunk: official icon input + validation system
 */
export default function LucideFullDemo() {
  const [pickerIcon, setPickerIcon] = useState("Folder");
  const [inputIcon, setInputIcon] = useState("Rainbow");

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 dark:bg-emerald-500/15 px-3 py-2 text-xs text-foreground">
        <p className="font-semibold">How to try discovery</p>
        <ol className="list-decimal list-inside mt-1.5 space-y-1 text-muted-foreground">
          <li>
            Type an icon name (e.g.{" "}
            <code className="font-mono text-foreground">alarm-clock</code> or
            paste a JSX import like{" "}
            <code className="font-mono text-foreground">
              &lt;Rainbow /&gt;
            </code>
            ) — the field auto-corrects it.
          </li>
          <li>
            Click the{" "}
            <span className="text-foreground font-medium">spinner icon</span>{" "}
            inside the field to validate, or press Enter.
          </li>
          <li>
            Use{" "}
            <span className="text-foreground font-medium">Search Lucide</span>{" "}
            to browse the full site in a floating frame, or{" "}
            <span className="text-foreground font-medium">Icon gallery</span>{" "}
            for the curated offline grid.
          </li>
        </ol>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex flex-wrap items-center gap-2">
            IconInputWithValidation
            <Badge variant="secondary" className="font-mono text-[10px]">
              @/components/official/icons/IconInputWithValidation
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Full input with live validation, auto-correction, Lucide search, and
            curated gallery. Selected:{" "}
            <span className="font-mono text-foreground">{pickerIcon}</span>
          </p>
        </CardHeader>
        <CardContent>
          <IconInputWithValidation
            value={pickerIcon}
            onChange={setPickerIcon}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex flex-wrap items-center gap-2">
            Compact variant (no Lucide link)
            <Badge variant="secondary" className="font-mono text-[10px]">
              showLucideLink={"{false}"}
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Same component with the fine-print Lucide link hidden — useful in
            tight forms.
          </p>
        </CardHeader>
        <CardContent>
          <IconInputWithValidation
            value={inputIcon}
            onChange={setInputIcon}
            showLucideLink={false}
          />
        </CardContent>
      </Card>
    </div>
  );
}
