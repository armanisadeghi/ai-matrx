"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { AppletLayoutSelection } from "@/features/applet/builder/parts/AppletLayoutSelection";

interface LayoutTabProps {
    appletId: string;
    layoutType?: string;
    appletSubmitText?: string;
    overviewLabel?: string;
}

export default function LayoutTab({ appletId, layoutType, appletSubmitText, overviewLabel }: LayoutTabProps) {
    return (
        <div className="space-y-4">
            <Card className="p-4">
                <div className="w-full space-y-2">
                    <AppletLayoutSelection appletId={appletId} label="Layout Type" />
                </div>
            </Card>
        </div>
    );
}
