'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

const hslToHex = (h: number, s: number, l: number) => {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

const parseHSL = (hslString: string) => {
    const [h, s, l] = hslString.split(' ').map(parseFloat);
    return { h, s, l };
}

const ColorSwatch = ({ label, variable, contrastClass }: { label: string; variable: string; contrastClass: string }) => {
    const [color, setColor] = useState('#000000');

    useEffect(() => {
        const computeColor = () => {
            const testDiv = document.createElement('div');
            testDiv.className = contrastClass;
            document.body.appendChild(testDiv);
            const style = getComputedStyle(testDiv);
            const hslValue = style.getPropertyValue(variable).trim();
            document.body.removeChild(testDiv);

            if (hslValue) {
                const { h, s, l } = parseHSL(hslValue);
                setColor(hslToHex(h, s, l));
            }
        };

        computeColor();
    }, [variable, contrastClass]);

    return (
        <div className="flex items-center mb-2">
            <div
                className="w-8 h-8 mr-2 rounded border border-gray-300"
                style={{ backgroundColor: color }}
            />
            <span className="text-sm">{label}: {color}</span>
        </div>
    );
};

const ContrastColorSwatches = ({ contrast }: { contrast: string }) => {
    const colorVariables = [
        { label: 'Primary', variable: '--primary' },
        { label: 'Primary Foreground', variable: '--primary-foreground' },
        { label: 'Secondary', variable: '--secondary' },
        { label: 'Secondary Foreground', variable: '--secondary-foreground' },
        { label: 'Muted', variable: '--muted' },
        { label: 'Muted Foreground', variable: '--muted-foreground' },
        { label: 'Accent', variable: '--accent' },
        { label: 'Accent Foreground', variable: '--accent-foreground' },
        { label: 'Ring', variable: '--ring' },
    ];

    return (
        <Card className={`w-full max-w-md ${contrast}`}>
            <CardHeader>
                <h2 className="text-lg font-semibold">{contrast.replace('contrast-', '').charAt(0).toUpperCase() + contrast.replace('contrast-', '').slice(1)} Contrast</h2>
            </CardHeader>
            <CardContent>
                {colorVariables.map((color) => (
                    <ColorSwatch key={color.variable} label={color.label} variable={color.variable} contrastClass={contrast} />
                ))}
            </CardContent>
        </Card>
    );
};

const ContrastSettings = () => {
    const contrastOptions = ['contrast-red', 'contrast-blue', 'contrast-green', 'contrast-violet', 'contrast-yellow'];

    return (
        <div className="p-4 space-y-4">
            <h1 className="text-2xl font-bold mb-4">Contrast Settings</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {contrastOptions.map((contrast) => (
                    <ContrastColorSwatches key={contrast} contrast={contrast} />
                ))}
            </div>
        </div>
    );
};

export default ContrastSettings;