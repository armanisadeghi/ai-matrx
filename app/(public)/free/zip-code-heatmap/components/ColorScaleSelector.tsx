'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Palette, TrendingUp } from 'lucide-react';

export type ScalingMethod = 'linear' | 'logarithmic' | 'quantile' | 'equalInterval';
export type ColorScheme = 'yellowRed' | 'blueRed' | 'greenBlue' | 'purpleOrange' | 'rainbow' | 'viridis';

export interface ColorScaleOptions {
  scalingMethod: ScalingMethod;
  colorScheme: ColorScheme;
}

interface ColorScaleSelectorProps {
  options: ColorScaleOptions;
  onChange: (options: ColorScaleOptions) => void;
}

export const COLOR_SCHEMES: Record<ColorScheme, { name: string; colors: string[]; description: string }> = {
  yellowRed: {
    name: 'Yellow to Red',
    colors: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'],
    description: 'Classic heatmap (light to dark)',
  },
  blueRed: {
    name: 'Blue to Red',
    colors: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'],
    description: 'Diverging scale (cold to hot)',
  },
  greenBlue: {
    name: 'Green to Blue',
    colors: ['#f7fcf0', '#e0f3db', '#ccebc5', '#a8ddb5', '#7bccc4', '#4eb3d3', '#2b8cbe', '#0868ac', '#084081'],
    description: 'Cool tones (calming)',
  },
  purpleOrange: {
    name: 'Purple to Orange',
    colors: ['#7f3b08', '#b35806', '#e08214', '#fdb863', '#fee0b6', '#d8daeb', '#b2abd2', '#8073ac', '#542788'],
    description: 'Diverging scale (warm contrast)',
  },
  rainbow: {
    name: 'Rainbow',
    colors: ['#9400D3', '#4B0082', '#0000FF', '#00FF00', '#FFFF00', '#FF7F00', '#FF0000'],
    description: 'Full spectrum (high contrast)',
  },
  viridis: {
    name: 'Viridis',
    colors: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde724'],
    description: 'Perceptually uniform (scientific)',
  },
};

export const SCALING_METHODS: Record<ScalingMethod, { name: string; description: string }> = {
  linear: {
    name: 'Linear',
    description: 'Direct proportional scale',
  },
  logarithmic: {
    name: 'Logarithmic',
    description: 'Better for wide ranges with outliers',
  },
  quantile: {
    name: 'Quantile',
    description: 'Equal distribution across colors',
  },
  equalInterval: {
    name: 'Equal Interval',
    description: 'Divides range into equal parts',
  },
};

export default function ColorScaleSelector({ options, onChange }: ColorScaleSelectorProps) {
  const handleScalingChange = (value: ScalingMethod) => {
    onChange({ ...options, scalingMethod: value });
  };

  const handleColorSchemeChange = (value: ColorScheme) => {
    onChange({ ...options, colorScheme: value });
  };

  return (
    <div className="space-y-4">
      {/* Scaling Method */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <Label className="text-sm font-semibold">Scaling Method</Label>
        </div>
        <Select value={options.scalingMethod} onValueChange={handleScalingChange}>
          <SelectTrigger className="h-auto py-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SCALING_METHODS).map(([key, { name, description }]) => (
              <SelectItem key={key} value={key} className="py-3">
                <div className="flex flex-col items-start gap-0.5">
                  <span className="font-medium leading-none">{name}</span>
                  <span className="text-xs text-muted-foreground leading-tight">{description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {SCALING_METHODS[options.scalingMethod].description}
        </p>
      </div>

      {/* Color Scheme */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          <Label className="text-sm font-semibold">Color Scheme</Label>
        </div>
        <Select value={options.colorScheme} onValueChange={handleColorSchemeChange}>
          <SelectTrigger className="h-auto py-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(COLOR_SCHEMES).map(([key, { name, colors, description }]) => (
              <SelectItem key={key} value={key} className="py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5 flex-shrink-0">
                    {colors.slice(0, 5).map((color, idx) => (
                      <div
                        key={idx}
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="font-medium leading-none">{name}</span>
                    <span className="text-xs text-muted-foreground leading-tight">{description}</span>
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-0.5 mt-2 h-3 rounded overflow-hidden">
          {COLOR_SCHEMES[options.colorScheme].colors.map((color, idx) => (
            <div
              key={idx}
              className="flex-1"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

