'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Papa from 'papaparse';

const LabelGenerator = dynamic(() => import('@/lib/qr-labels/LabelGenerator'), {
  ssr: false,
  loading: () => <div className="text-center p-4">Loading label generator...</div>,
});

interface LabelEntry {
  qr_value: string;
  text_elements: string[];
}

const QRLabelsPage = () => {
  const [entries, setEntries] = useState<LabelEntry[]>([]);
  const [currentEntry, setCurrentEntry] = useState<LabelEntry>({
    qr_value: '',
    text_elements: ['', '', '', '', '', '']
  });

  const handlePDFGenerated = (pdfBlob: Blob) => {
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'labels.pdf';
    link.click();
  };

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
    <div className="container mx-auto p-6">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>QR Label Generator</CardTitle>
          <CardDescription>
            Generate QR code labels with multiple input options
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="manual" className="space-y-4">
        <TabsList>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          <TabsTrigger value="csv">CSV Upload</TabsTrigger>
          <TabsTrigger value="preview">Preview & Generate</TabsTrigger>
        </TabsList>

        <TabsContent value="manual">
          <Card>
            <CardHeader>
              <CardTitle>Manual Label Entry</CardTitle>
              <CardDescription>Enter label information manually</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="qr-value">SKU/QR Value</Label>
                <Input
                  id="qr-value"
                  value={currentEntry.qr_value}
                  onChange={(e) => setCurrentEntry(prev => ({
                    ...prev,
                    qr_value: e.target.value
                  }))}
                  placeholder="Enter SKU or QR value"
                />
              </div>

              {currentEntry.text_elements.map((text, index) => (
                <div key={index} className="space-y-2">
                  <Label htmlFor={`text-${index}`}>Text Line {index + 1}</Label>
                  <Input
                    id={`text-${index}`}
                    value={text}
                    onChange={(e) => handleTextChange(index, e.target.value)}
                    placeholder={`Enter text for line ${index + 1}`}
                  />
                </div>
              ))}

              <Button onClick={handleManualEntry}>Add Label</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="csv">
          <Card>
            <CardHeader>
              <CardTitle>CSV Upload</CardTitle>
              <CardDescription>
                Upload a CSV file with label information. Format: SKU, Text1, Text2, Text3, Text4, Text5, Text6
              </CardDescription>
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
              <CardTitle>Preview & Generate</CardTitle>
              <CardDescription>
                Review and generate your labels ({entries.length} labels ready)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-2">Current Labels:</h3>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {entries.map((entry, index) => (
                    <div key={index} className="p-2 border rounded">
                      <p className="font-medium">SKU: {entry.qr_value}</p>
                      {entry.text_elements.map((text, i) => (
                        <p key={i} className="text-sm text-gray-600">
                          Line {i + 1}: {text}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {entries.length > 0 && (
                <LabelGenerator
                  entries={entries}
                  onGenerate={handlePDFGenerated}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default QRLabelsPage;