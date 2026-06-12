"use client";

import SearchableSelect, { type Option } from '@/components/matrx/SearchableSelect';
import React, { useState } from 'react';


const testOptions: Option[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date' },
  { value: 'elderberry', label: 'Elderberry' },
];

export default function TestPage() {
  const [selectedValue, setSelectedValue] = useState<string>();

  return (
    <div className="min-h-dvh bg-background p-8">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-xl font-bold">SearchableSelect Test</h1>
        
        <div>
          <h2 className="text-sm font-medium mb-2">Current selection: {selectedValue || 'none'}</h2>
          <SearchableSelect
            options={testOptions}
            value={selectedValue}
            onChange={(option) => {
              console.log('Selected:', option);
              setSelectedValue(option.value);
            }}
          />
        </div>
      </div>
    </div>
  );
}