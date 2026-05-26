'use client';

import React from 'react';
import { HexColorPicker } from 'react-colorful';
import { Colord, colord } from 'colord';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ColorPickerProps {
    color: Colord;
    onChange: (color: Colord) => void;
}

const predefinedColors = [
    '#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#8B00FF', '#FF00FF',
    '#000000', '#808080', '#FFFFFF', '#800000', '#808000', '#008000', '#800080', '#008080', '#000080'
];


export default function ColorPicker({ color, onChange }: ColorPickerProps) {
    const handleChange = (hex: string) => {
        onChange(colord(hex));
    };

    return (
        <Card className="bg-background dark:bg-background">
            <CardHeader>
                <CardTitle className="text-foreground dark:text-foreground">Color Picker</CardTitle>
            </CardHeader>
            <CardContent>
                <HexColorPicker color={color.toHex()} onChange={handleChange} />
            </CardContent>
        </Card>
    );
}
