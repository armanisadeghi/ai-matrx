'use client';

/**
 * QR Label Generator demo — exercises the reusable label-print core
 * (@ai-matrx/print): template registry, sheet preview, calibration page,
 * print window (qrLabelsPrinter) and PDF download (downloadLabelsPdf).
 */

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@ai-matrx/design-system';
import { Label } from '@/components/ui/label';
import { Printer, FileDown, Crosshair, Trash2 } from 'lucide-react';
import Papa from 'papaparse';
import { toast } from '@/lib/toast';
import {
  LABEL_TEMPLATES,
  getLabelTemplate,
  qrLabelsPrinter,
  printCalibrationSheet,
  type QrLabel,
  type QrLabelPrintData,
} from '@ai-matrx/print/labels';
import {
  LabelSheetPreview,
  PrintOptionsDialog,
  usePrintOptions,
} from '@ai-matrx/print/react';

const QRLabelsPage = () => {
  const [labels, setLabels] = useState<QrLabel[]>([]);
  const [templateId, setTemplateId] = useState<string>('avery-5163');
  const [qrValue, setQrValue] = useState('');
  const [caption, setCaption] = useState('');
  const [lines, setLines] = useState<string[]>(['', '', '', '', '', '']);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

  const template = getLabelTemplate(templateId) ?? LABEL_TEMPLATES[0];
  const printData: QrLabelPrintData = { labels, templateId };
  const { open, setOpen, triggerPrint } = usePrintOptions(qrLabelsPrinter, printData);

  const perPage = template.cols * template.rows;
  const pageCount = Math.max(1, Math.ceil(labels.length / perPage));

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    Papa.parse<string[]>(file, {
      complete: (results) => {
        const parsed: QrLabel[] = results.data
          .filter((row) => row[0]?.trim())
          .map((row) => ({
            qrValue: row[0].trim(),
            caption: row[0].trim(),
            lines: row.slice(1, 7).filter((l) => l?.trim()),
          }));
        setLabels((prev) => [...prev, ...parsed]);
        toast.success(`Added ${parsed.length} labels from CSV`);
      },
      header: false,
      skipEmptyLines: true,
    });
    event.target.value = '';
  };

  const handleManualEntry = () => {
    if (!qrValue.trim()) return;
    setLabels((prev) => [
      ...prev,
      {
        qrValue: qrValue.trim(),
        caption: caption.trim() || undefined,
        lines: lines.filter((l) => l.trim()),
      },
    ]);
    setQrValue('');
    setCaption('');
    setLines(['', '', '', '', '', '']);
  };

  const handleDownloadPdf = async () => {
    if (!labels.length || isDownloading) return;
    setIsDownloading(true);
    try {
      const { downloadLabelsPdf } = await import('@ai-matrx/print/labels');
      await downloadLabelsPdf(printData, templateId);
    } catch (err) {
      console.error('[qr-label-generator] PDF download failed:', err);
      toast.error('PDF generation failed');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>QR Label Generator</CardTitle>
          <CardDescription>
            Warehouse-grade QR labels on standard label sheets — powered by @ai-matrx/print
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Label htmlFor="template" className="text-sm">Label stock</Label>
          <select
            id="template"
            value={templateId}
            onChange={(e) => { setTemplateId(e.target.value); setPageIndex(0); }}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {LABEL_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.stockCode} — {t.name}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => printCalibrationSheet(template)}>
            <Crosshair className="w-4 h-4 mr-1.5" />
            Calibration page
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="manual" className="space-y-4">
        <TabsList>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          <TabsTrigger value="csv">CSV Upload</TabsTrigger>
          <TabsTrigger value="preview">Preview &amp; Print</TabsTrigger>
        </TabsList>

        <TabsContent value="manual">
          <Card>
            <CardHeader>
              <CardTitle>Manual Label Entry</CardTitle>
              <CardDescription>Enter label information manually</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="qr-value">SKU / QR Value</Label>
                <Input
                  id="qr-value"
                  value={qrValue}
                  onChange={(e) => setQrValue(e.target.value)}
                  placeholder="Enter SKU or QR value"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="caption">Caption (defaults to the QR value)</Label>
                <Input
                  id="caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Bold headline printed with the code"
                />
              </div>
              {lines.map((text, index) => (
                <div key={index} className="space-y-2">
                  <Label htmlFor={`text-${index}`}>Text Line {index + 1}</Label>
                  <Input
                    id={`text-${index}`}
                    value={text}
                    onChange={(e) =>
                      setLines((prev) => prev.map((l, i) => (i === index ? e.target.value : l)))
                    }
                    placeholder={`Enter text for line ${index + 1}`}
                  />
                </div>
              ))}
              <Button onClick={handleManualEntry} disabled={!qrValue.trim()}>Add Label</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="csv">
          <Card>
            <CardHeader>
              <CardTitle>CSV Upload</CardTitle>
              <CardDescription>
                Upload a CSV file. Format: qr_value, Text1, Text2, Text3, Text4, Text5, Text6
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input type="file" accept=".csv" onChange={handleCSVUpload} className="mb-4" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <Card>
            <CardHeader>
              <CardTitle>Preview &amp; Print</CardTitle>
              <CardDescription>
                {labels.length} labels · {template.stockCode} · {perPage} per sheet · {pageCount}{' '}
                sheet{pageCount === 1 ? '' : 's'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button onClick={triggerPrint} disabled={!labels.length}>
                  <Printer className="w-4 h-4 mr-1.5" />
                  Print label sheet
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadPdf}
                  disabled={!labels.length || isDownloading}
                >
                  <FileDown className="w-4 h-4 mr-1.5" />
                  {isDownloading ? 'Generating PDF…' : 'Download PDF'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setLabels([])}
                  disabled={!labels.length}
                  className="text-muted-foreground"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Clear all
                </Button>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Sheet preview</p>
                    {pageCount > 1 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                          disabled={pageIndex === 0}
                        >
                          Prev
                        </Button>
                        <span>
                          Sheet {pageIndex + 1} / {pageCount}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
                          disabled={pageIndex >= pageCount - 1}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                  <LabelSheetPreview
                    template={template}
                    labels={labels}
                    pageIndex={pageIndex}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Labels</p>
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {labels.map((entry, index) => (
                      <div key={index} className="p-2 border border-border rounded flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{entry.qrValue}</p>
                          {entry.caption && entry.caption !== entry.qrValue && (
                            <p className="text-xs text-muted-foreground truncate">{entry.caption}</p>
                          )}
                          {entry.lines?.map((text, i) => (
                            <p key={i} className="text-xs text-muted-foreground truncate">{text}</p>
                          ))}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => setLabels((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                    {!labels.length && (
                      <p className="text-sm text-muted-foreground">
                        No labels yet — add some in Manual Entry or CSV Upload.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PrintOptionsDialog
        printer={qrLabelsPrinter}
        data={printData}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
};

export default QRLabelsPage;
