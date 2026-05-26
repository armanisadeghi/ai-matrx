'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Colord, extend, colord } from 'colord';
import mixPlugin from "colord/plugins/mix";

extend([mixPlugin]);

interface ColorManipulationProps {
    color: Colord;
    onColorChange: (color: Colord) => void;
}

export default function ColorManipulation({ color, onColorChange }: ColorManipulationProps) {
    const [percentages, setPercentages] = useState({
        lighten: 0,
        darken: 0,
        saturate: 0,
        desaturate: 0,
        mix: 0
    });

    const handleManipulation = (type: string, amount: number) => {
        let newColor: Colord;
        let newPercentage = Math.min(100, Math.max(0, percentages[type] + amount));

        switch (type) {
            case 'lighten':
                newColor = color.mix('#ffffff', newPercentage / 100);
                break;
            case 'darken':
                newColor = color.mix('#000000', newPercentage / 100);
                break;
            case 'saturate':
                newColor = color.saturate(newPercentage / 100);
                break;
            case 'desaturate':
                newColor = color.desaturate(newPercentage / 100);
                break;
            case 'mix':
                newColor = color.mix('#808080', newPercentage / 100);
                break;
            default:
                newColor = color;
        }

        setPercentages(prev => ({ ...prev, [type]: newPercentage }));
        onColorChange(newColor);
    };

    const resetManipulation = (type: string) => {
        setPercentages(prev => ({ ...prev, [type]: 0 }));
        onColorChange(color);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Color Manipulation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {['lighten', 'darken', 'saturate', 'desaturate', 'mix'].map((type) => (
                    <div key={type} className="space-y-2">
                        <label className="text-sm font-medium">
                            {type.charAt(0).toUpperCase() + type.slice(1)} ({percentages[type]}%)
                        </label>
                        <div className="flex items-center space-x-2">
                            <Slider
                                min={0}
                                max={100}
                                step={1}
                                value={[percentages[type]]}
                                onValueChange={(value) => handleManipulation(type, value[0] - percentages[type])}
                            />
                            <Button onClick={() => handleManipulation(type, 10)}>+10%</Button>
                            <Button onClick={() => resetManipulation(type)}>Reset</Button>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
