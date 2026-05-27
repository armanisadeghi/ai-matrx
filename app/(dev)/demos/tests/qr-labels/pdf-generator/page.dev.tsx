// components/previews/PDFGenerator.tsx
'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import dynamic from 'next/dynamic';
import Papa from 'papaparse';

const LabelGenerator = dynamic(() => import('@/lib/qr-labels/LabelGenerator'), {
  ssr: false,
  loading: () => <div className="text-center p-4">Loading label generator...</div>,
});

interface PDFGeneratorProps {
  onGenerate: (pdfBlob: Blob) => void;
}

export default function PDFGenerator({ onGenerate }: PDFGeneratorProps) {
  const [entries, setEntries] = useState<Array<{
    qr_value: string;
    text_elements: string[];
  }>>([]);
  
  const [currentEntry, setCurrentEntry] = useState({
    qr_value: '',
    text_elements: ['', '', '', '', '', '']
  });

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        complete: (results) => {
          const parsedEntries = results.data
            .filter((row: any) => row[0])
            .map((row: any) => ({
              qr_value: row[0],
              text_elements: row.slice(1, 7)
            }));
          setEntries(parsedEntries);
        },
        header: false,
        skipEmptyLines: true
      });
    }
  };

  const handleManualEntry = () => {
    setEntries(prev => [...prev, { ...currentEntry }]);
    setCurrentEntry({
      qr_value: '',
      text_elements: ['', '', '', '', '', '']
    });
  };

  const handleTextChange = (index: number, value: string) => {
    const newElements = [...currentEntry.text_elements];
    newElements[index] = value;
    setCurrentEntry(prev => ({
      ...prev,
      text_elements: newElements
    }));
  };

  return (
    <div className="w-full p-4">
      <Tabs defaultValue="manual" className="space-y-4">
        <TabsList>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          <TabsTrigger value="csv">CSV Upload</TabsTrigger>
          <TabsTrigger value="preview">Generate</TabsTrigger>
        </TabsList>

        <TabsContent value="manual">
          <Card>
            <CardHeader>
              <CardTitle>Manual Entry</CardTitle>
              <CardDescription>Enter label information manually</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="qr-value">QR Value</Label>
                <Input
                  id="qr-value"
                  value={currentEntry.qr_value}
                  onChange={(e) => setCurrentEntry(prev => ({
                    ...prev,
                    qr_value: e.target.value
                  }))}
                />
              </div>

              {currentEntry.text_elements.map((text, index) => (
                <div key={index} className="space-y-2">
                  <Label htmlFor={`text-${index}`}>Text {index + 1}</Label>
                  <Input
                    id={`text-${index}`}
                    value={text}
                    onChange={(e) => handleTextChange(index, e.target.value)}
                  />
                </div>
              ))}

              <Button onClick={handleManualEntry}>Add Entry</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="csv">
          <Card>
            <CardHeader>
              <CardTitle>CSV Upload</CardTitle>
              <CardDescription>Upload a CSV file with entries</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="mb-4"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <Card>
            <CardHeader>
              <CardTitle>Generate PDF</CardTitle>
              <CardDescription>{entries.length} entries ready</CardDescription>
            </CardHeader>
            <CardContent>
              {entries.length > 0 && (
                <LabelGenerator
                  entries={entries}
                  onGenerate={onGenerate}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}