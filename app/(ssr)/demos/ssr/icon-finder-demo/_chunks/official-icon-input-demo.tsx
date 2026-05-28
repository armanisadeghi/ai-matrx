"use client";

import { useState } from "react";
import IconInputWithValidation, {
  IconInputCompact,
} from "@/components/official/icons/IconInputWithValidation.dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

/**
 * Lazy chunk: official text input + validation (no full icon grid)
 */
export default function OfficialIconInputDemo() {
  const [full, setFull] = useState("Home");
  const [compact, setCompact] = useState("Star");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex flex-wrap items-center gap-2">
            IconInputWithValidation
            <Badge variant="secondary" className="font-mono text-[10px]">
              @/components/official/IconInputWithValidation.dynamic
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Compact row + fine print: Search Lucide and lucide.dev. Optional{" "}
            <code className="font-mono text-foreground">
              showCuratedIconGallery
            </code>{" "}
            adds a finite bundled + SVG window. Full Lucide catalog: mount{" "}
            <span className="font-medium text-foreground">
              Full Lucide browser
            </span>{" "}
            above.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Full</Label>
            <IconInputWithValidation value={full} onChange={setFull} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">IconInputCompact</Label>
            <IconInputCompact value={compact} onChange={setCompact} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
