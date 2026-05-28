"use client";

import { useState } from "react";
import { IconPicker } from "@/components/ui/IconPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Lazy chunk: curated applet / app-builder IconPicker (Lucide + react-icons subset)
 */
export default function AppletIconPickerDemo() {
  const [appIcon, setAppIcon] = useState("Home");
  const [submitIcon, setSubmitIcon] = useState("Send");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex flex-wrap items-center gap-2">
            Applet IconPicker — appIcon
            <Badge variant="secondary" className="font-mono text-[10px]">
              @/components/ui/IconPicker
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Curated list via getAppIconOptions(). Selected:{" "}
            <span className="font-mono text-foreground">{appIcon}</span>
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <IconPicker
            selectedIcon={appIcon}
            onIconSelect={setAppIcon}
            iconType="appIcon"
            dialogTitle="App icon"
            dialogDescription="Curated applet icons"
            primaryColor="gray"
            accentColor="blue"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex flex-wrap items-center gap-2">
            Applet IconPicker — submitIcon
            <Badge variant="secondary" className="font-mono text-[10px]">
              iconType=&quot;submitIcon&quot;
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Same component, submit-button styling. Selected:{" "}
            <span className="font-mono text-foreground">{submitIcon}</span>
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <IconPicker
            selectedIcon={submitIcon}
            onIconSelect={setSubmitIcon}
            iconType="submitIcon"
            dialogTitle="Submit icon"
            dialogDescription="Curated submit icons"
            primaryColor="gray"
            accentColor="blue"
          />
        </CardContent>
      </Card>
    </div>
  );
}
