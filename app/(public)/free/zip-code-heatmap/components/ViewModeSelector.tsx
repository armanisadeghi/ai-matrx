'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Map, MapPinned, MapIcon } from 'lucide-react';

export type ViewMode = 'zipCode' | 'zip3' | 'county';

export interface ViewModeOption {
  value: ViewMode;
  name: string;
  description: string;
  icon: React.ReactNode;
}

export const VIEW_MODES: ViewModeOption[] = [
  {
    value: 'zipCode',
    name: 'Individual Zip Codes',
    description: 'Show each zip code separately (most detail)',
    icon: <MapPinned className="w-4 h-4" />,
  },
  {
    value: 'zip3',
    name: 'ZIP-3 Regions',
    description: 'Group by first 3 digits (sectional centers)',
    icon: <Map className="w-4 h-4" />,
  },
  // County view coming soon
  // {
  //   value: 'county',
  //   name: 'County Level',
  //   description: 'Aggregate by county (big picture)',
  //   icon: <MapIcon className="w-4 h-4" />,
  // },
];

interface ViewModeSelectorProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}

export default function ViewModeSelector({ value, onChange }: ViewModeSelectorProps) {

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-sm font-semibold">Aggregation Level</Label>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-auto py-3">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VIEW_MODES.map((mode) => (
            <SelectItem key={mode.value} value={mode.value} className="py-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  {mode.icon}
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="font-medium leading-none">{mode.name}</span>
                    <span className="text-xs text-muted-foreground leading-tight">{mode.description}</span>
                  </div>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

