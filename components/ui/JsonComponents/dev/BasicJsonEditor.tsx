import React, { useState, useCallback } from 'react';
import { extractErrorMessage } from '@/utils/errors';
import { AlertCircle, Check } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const JsonEditor = () => {
  const [jsonInput, setJsonInput] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);

  // Helper function to safely stringify JSON with formatting
  const safeStringify = (obj) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (err) {
      return '';
    }
  };

  // Helper function to safely parse JSON
  const safeParse = (str) => {
    try {
      // Handle empty input
      if (!str.trim()) {
        return { success: false, error: 'Input is empty' };
      }

      const parsed = JSON.parse(str);
      
      // Additional validation can be added here
      if (parsed === null || parsed === undefined) {
        return { success: false, error: 'Invalid JSON value' };
      }

      return { success: true, data: parsed };
    } catch (err) {
      return { success: false, error: extractErrorMessage(err) };
    }
  };

  // Format the JSON input
  const formatJson = useCallback(() => {
    const result = safeParse(jsonInput);
    if (result.success) {
      const formatted = safeStringify(result.data);
      setJsonInput(formatted);
      setParsedData(result.data);
      setError(null);
      setIsValid(true);
    } else {
      setError(result.error ?? null);
      setIsValid(false);
    }
  }, [jsonInput]);

  // Handle input changes
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setJsonInput(newValue);
    
    // Basic validation on each change
    const result = safeParse(newValue);
    setIsValid(result.success);
    setError(result.success ? null : (result.error ?? null));
    if (result.success) {
      setParsedData(result.data);
    }
  };

  return (
    <div className="w-full max-w-4xl p-4 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">JSON Editor</h2>
        <button
          onClick={formatJson}
          className="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600 disabled:opacity-50"
          disabled={!jsonInput}
        >
          Format JSON
        </button>
      </div>

      <div className="relative">
        <textarea
          value={jsonInput}
          onChange={handleInputChange}
          className="w-full h-96 p-4 font-mono text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter your JSON here..."
        />
        
        <div className="absolute top-2 right-2">
          {isValid ? (
            <div className="flex items-center text-green-500">
              <Check size={20} />
              <span className="ml-1">Valid JSON</span>
            </div>
          ) : null}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>
      )}

      {parsedData && isValid && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Parsed Data Preview:</h3>
          <pre className="p-4 bg-gray-100 rounded overflow-auto max-h-60">
            {safeStringify(parsedData)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default JsonEditor;