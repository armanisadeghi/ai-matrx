"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import IconPickerDialog from "@/features/applet/builder/modules/applet-builder/IconPickerDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Lazy chunk: legacy IconPickerDialog (applet builder)
 */
export default function AppletIconDialogDemo() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex flex-wrap items-center gap-2">
          IconPickerDialog
          <Badge variant="secondary" className="font-mono text-[10px]">
            features/.../IconPickerDialog
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Same curated list as applet IconPicker, dialog controlled by parent.
          {selected ? (
            <>
              {" "}
              Last pick:{" "}
              <span className="font-mono text-foreground">{selected}</span>
            </>
          ) : null}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button type="button" onClick={() => setOpen(true)}>
          Open IconPickerDialog
        </Button>
        <IconPickerDialog
          showIconPicker={open}
          setShowIconPicker={setOpen}
          handleIconSelect={(name) => {
            setSelected(name);
            setOpen(false);
          }}
        />
      </CardContent>
    </Card>
  );
}
