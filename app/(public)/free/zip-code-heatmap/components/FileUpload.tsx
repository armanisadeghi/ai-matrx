'use client';

import { useRef, useState } from 'react';
import { Upload, FileText, X, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import Papa from 'papaparse';
import { ZipCodeData } from '../page';
import ColumnMapper from './ColumnMapper';

interface FileUploadProps {
  onDataUpload: (data: ZipCodeData[]) => void;
  onLoadingChange: (isLoading: boolean) => void;
}

export default function FileUpload({ onDataUpload, onLoadingChange }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [rawData, setRawData] = useState<Record<string, unknown>[]>([]);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);

  const handleFileSelect = (file: File) => {
    if (!file) return;

    const fileExt = file.name.toLowerCase();
    const isCSV = fileExt.endsWith('.csv');
    const isExcel = fileExt.endsWith('.xlsx') || fileExt.endsWith('.xls');

    if (!isCSV && !isExcel) {
      setError('Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
      setSuccess('');
      return;
    }

    setFileName(file.name);
    setError('');
    setSuccess('');
    onLoadingChange(true);

    if (isCSV) {
      // Handle CSV files
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const data = results.data;
            if (data.length === 0) {
              setError('CSV file is empty');
              onLoadingChange(false);
              return;
            }

            const columns = Object.keys(data[0]);
            setRawData(data);
            setAvailableColumns(columns);
            setShowColumnMapper(true);
            onLoadingChange(false);
          } catch (err) {
            setError('Failed to parse CSV file');
            console.error(err);
            onLoadingChange(false);
          }
        },
        error: (err) => {
          setError(`Error reading CSV file: ${err.message}`);
          onLoadingChange(false);
        },
      });
    } else {
      // Handle Excel files
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const XLSX = await import('xlsx');
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

          if (jsonData.length === 0) {
            setError('Excel file is empty');
            onLoadingChange(false);
            return;
          }

          const columns = Object.keys(jsonData[0]);
          setRawData(jsonData);
          setAvailableColumns(columns);
          setShowColumnMapper(true);
          onLoadingChange(false);
        } catch (err) {
          setError('Failed to parse Excel file');
          console.error(err);
          onLoadingChange(false);
        }
      };
      reader.onerror = () => {
        setError('Error reading Excel file');
        onLoadingChange(false);
      };
      reader.readAsBinaryString(file);
    }
  };

  const handleColumnMapping = (mapping: { zipColumn: string; countColumn: string }) => {
    setShowColumnMapper(false);
    onLoadingChange(true);

    try {
      const validData: ZipCodeData[] = [];
      const errors: string[] = [];

      rawData.forEach((row, index) => {
        const zipCode = row[mapping.zipColumn];
        const count = row[mapping.countColumn];

        if (!zipCode || count === undefined || count === null || count === '') {
          errors.push(`Row ${index + 1}: Missing data`);
          return;
        }

        const parsedCount = typeof count === 'number' ? count : parseInt(String(count).replace(/[^0-9]/g, ''));
        if (isNaN(parsedCount)) {
          errors.push(`Row ${index + 1}: Invalid count value`);
          return;
        }

        validData.push({
          zipCode: String(zipCode).trim(),
          count: parsedCount,
        });
      });

      if (validData.length === 0) {
        setError('No valid data found after mapping columns');
        onLoadingChange(false);
        return;
      }

      onDataUpload(validData);
      setSuccess(`Successfully loaded ${validData.length} zip codes`);
      if (errors.length > 0) {
        console.warn('Data parsing warnings:', errors.slice(0, 10));
      }
    } catch (err) {
      setError('Failed to process data');
      console.error(err);
    } finally {
      onLoadingChange(false);
    }
  };

  const handleCancelMapping = () => {
    setShowColumnMapper(false);
    setRawData([]);
    setAvailableColumns([]);
    setFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const clearFile = () => {
    setFileName('');
    setError('');
    setSuccess('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onDataUpload([]);
  };

  return (
    <>
      {showColumnMapper && (
        <ColumnMapper
          columns={availableColumns}
          previewData={rawData}
          onConfirm={handleColumnMapping}
          onCancel={handleCancelMapping}
        />
      )}

      <div className="space-y-3">
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
            transition-all duration-200
            ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
            ${fileName ? 'bg-muted/50' : 'hover:bg-muted/30'}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />

          {fileName ? (
            <div className="flex items-center justify-center gap-2">
              {fileName.endsWith('.csv') ? (
                <FileText className="w-5 h-5 text-primary" />
              ) : (
                <FileSpreadsheet className="w-5 h-5 text-green-600" />
              )}
              <span className="text-sm font-medium truncate max-w-[150px]">{fileName}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                className="ml-2 p-1 hover:bg-destructive/10 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-destructive" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">
                {isDragging ? 'Drop file here' : 'Click to upload or drag & drop'}
              </p>
              <p className="text-xs text-muted-foreground">CSV or Excel files (.csv, .xlsx, .xls)</p>
            </>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p className="text-xs">{error}</p>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-green-500/10 text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p className="text-xs">{success}</p>
          </div>
        )}
      </div>
    </>
  );
}

