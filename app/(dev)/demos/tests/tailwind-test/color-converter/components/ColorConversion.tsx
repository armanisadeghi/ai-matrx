'use client';

import React, { useMemo } from 'react';
import { Colord } from 'colord';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { getColorFormats } from '@/utils/color-utils/color-change-util';
import { FullJsonViewer } from "@/components/ui/JsonComponents/JsonViewerComponent";

interface ColorConversionProps {
    color: Colord;
}

export default function ColorConversion({ color }: ColorConversionProps) {
    // Memoize color formats to prevent unnecessary recalculations
    const colorFormats = useMemo(() => getColorFormats(color), [color]);

    // Format input values for display
    const formatValue = (value: unknown): string => {
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
    };

    return (
        <Card className="bg-background">
            <CardHeader>
                <CardTitle className="text-foreground">Color Conversion</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {/* Color format inputs */}
                    <div className="grid gap-4">
                        {Object.entries(colorFormats).map(([name, value]) => (
                            <div key={name} className="grid grid-cols-[1fr_2fr] items-center gap-2">
                                <Label htmlFor={name} className="text-foreground capitalize">
                                    {name}
                                </Label>
                                <Input
                                    id={name}
                                    value={formatValue(value)}
                                    readOnly
                                    className="bg-input text-foreground font-mono text-sm"
                                />
                            </div>
                        ))}
                    </div>

                    {/* JSON viewer */}
                    <div className="pt-4">
                        <FullJsonViewer
                            data={colorFormats}
                            title="Combined Color Formats"
                            maxHeight="400px"
                            hideControls={false}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}