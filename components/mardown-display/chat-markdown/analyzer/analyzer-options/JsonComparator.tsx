import React, { useState } from 'react';

export default function JsonComparator() {
  const [leftJson, setLeftJson] = useState('');
  const [rightJson, setRightJson] = useState('');
  const [leftParsed, setLeftParsed] = useState(null);
  const [rightParsed, setRightParsed] = useState(null);
  const [leftError, setLeftError] = useState('');
  const [rightError, setRightError] = useState('');
  const [comparison, setComparison] = useState(null);

  const cleanAndParseJson = (text) => {
    if (!text.trim()) return { parsed: null, error: '', cleaned: '' };
    
    try {
      // Remove leading/trailing whitespace and common copy-paste artifacts
      let cleaned = text.trim();
      
      // Remove common prefixes that might come from copy-paste
      cleaned = cleaned.replace(/^[^{[\"]*([\[{])/, '$1');
      cleaned = cleaned.replace(/([\]}])[^}\]]*$/, '$1');
      
      const parsed = JSON.parse(cleaned);
      const formatted = JSON.stringify(parsed, null, 2);
      
      return { parsed, error: '', cleaned: formatted };
    } catch (error) {
      return { parsed: null, error: error.message, cleaned: text };
    }
  };

  const handleLeftBlur = () => {
    const result = cleanAndParseJson(leftJson);
    setLeftParsed(result.parsed);
    setLeftError(result.error);
    setLeftJson(result.cleaned);
    setComparison(null);
  };

  const handleRightBlur = () => {
    const result = cleanAndParseJson(rightJson);
    setRightParsed(result.parsed);
    setRightError(result.error);
    setRightJson(result.cleaned);
    setComparison(null);
  };

  const deepCompare = (obj1, obj2, path = '') => {
    const differences = [];
    
    if (obj1 === obj2) return differences;
    
    if (typeof obj1 !== typeof obj2) {
      differences.push({
        path: path || 'root',
        type: 'type_mismatch',
        left: typeof obj1,
        right: typeof obj2,
        leftValue: obj1,
        rightValue: obj2
      });
      return differences;
    }
    
    if (obj1 === null || obj2 === null) {
      differences.push({
        path: path || 'root',
        type: 'null_mismatch',
        left: obj1,
        right: obj2
      });
      return differences;
    }
    
    if (Array.isArray(obj1) !== Array.isArray(obj2)) {
      differences.push({
        path: path || 'root',
        type: 'array_object_mismatch',
        left: Array.isArray(obj1) ? 'array' : 'object',
        right: Array.isArray(obj2) ? 'array' : 'object'
      });
      return differences;
    }
    
    if (Array.isArray(obj1)) {
      if (obj1.length !== obj2.length) {
        differences.push({
          path: path || 'root',
          type: 'array_length_mismatch',
          left: obj1.length,
          right: obj2.length
        });
      }
      
      const maxLength = Math.max(obj1.length, obj2.length);
      for (let i = 0; i < maxLength; i++) {
        const newPath = path ? `${path}[${i}]` : `[${i}]`;
        if (i >= obj1.length) {
          differences.push({
            path: newPath,
            type: 'missing_in_left',
            rightValue: obj2[i]
          });
        } else if (i >= obj2.length) {
          differences.push({
            path: newPath,
            type: 'missing_in_right',
            leftValue: obj1[i]
          });
        } else {
          differences.push(...deepCompare(obj1[i], obj2[i], newPath));
        }
      }
    } else if (typeof obj1 === 'object') {
      const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
      
      for (const key of allKeys) {
        const newPath = path ? `${path}.${key}` : key;
        
        if (!(key in obj1)) {
          differences.push({
            path: newPath,
            type: 'missing_in_left',
            rightValue: obj2[key]
          });
        } else if (!(key in obj2)) {
          differences.push({
            path: newPath,
            type: 'missing_in_right',
            leftValue: obj1[key]
          });
        } else {
          differences.push(...deepCompare(obj1[key], obj2[key], newPath));
        }
      }
    } else {
      differences.push({
        path: path || 'root',
        type: 'value_mismatch',
        leftValue: obj1,
        rightValue: obj2
      });
    }
    
    return differences;
  };

  const handleCompare = () => {
    if (!leftParsed || !rightParsed) {
      setComparison({ identical: false, error: 'Both sides must contain valid JSON' });
      return;
    }
    
    const differences = deepCompare(leftParsed, rightParsed);
    
    setComparison({
      identical: differences.length === 0,
      differences: differences
    });
  };

  const renderDifference = (diff, index) => {
    const typeLabels = {
      type_mismatch: 'Type Mismatch',
      null_mismatch: 'Null Mismatch',
      array_object_mismatch: 'Array/Object Mismatch',
      array_length_mismatch: 'Array Length Mismatch',
      missing_in_left: 'Missing in Left',
      missing_in_right: 'Missing in Right',
      value_mismatch: 'Value Mismatch'
    };
    
    return (
      <div key={index} className="border-l-4 border-red-500 pl-3 py-2 mb-2 bg-red-50 dark:bg-red-950/20">
        <div className="font-medium text-red-800 dark:text-red-300">{typeLabels[diff.type]}</div>
        <div className="text-sm text-red-600 dark:text-red-400">Path: {diff.path}</div>
        {diff.leftValue !== undefined && (
          <div className="text-sm">Left: {JSON.stringify(diff.leftValue)}</div>
        )}
        {diff.rightValue !== undefined && (
          <div className="text-sm">Right: {JSON.stringify(diff.rightValue)}</div>
        )}
        {diff.left !== undefined && diff.right !== undefined && (
          <div className="text-sm">Left: {diff.left}, Right: {diff.right}</div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 flex">
        <div className="w-1/2 flex flex-col border-r">
          <textarea
            value={leftJson}
            onChange={(e) => setLeftJson(e.target.value)}
            onBlur={handleLeftBlur}
            placeholder="Paste JSON here..."
            className="flex-1 p-2 font-mono text-sm resize-none border-0 focus:outline-none focus:ring-0 bg-background"
          />
          {leftError && (
            <div className="p-2 bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300 text-sm border-t">
              Error: {leftError}
            </div>
          )}
        </div>
        
        <div className="w-1/2 flex flex-col">
          <textarea
            value={rightJson}
            onChange={(e) => setRightJson(e.target.value)}
            onBlur={handleRightBlur}
            placeholder="Paste JSON here..."
            className="flex-1 p-2 font-mono text-sm resize-none border-0 focus:outline-none focus:ring-0 bg-background"
          />
          {rightError && (
            <div className="p-2 bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300 text-sm border-t">
              Error: {rightError}
            </div>
          )}
        </div>
      </div>
      
      <div className="border-t p-4">
        <button
          onClick={handleCompare}
          disabled={!leftParsed || !rightParsed}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Compare
        </button>
        
        {comparison && (
          <div className="mt-4">
            {comparison.error ? (
              <div className="text-red-600">{comparison.error}</div>
            ) : comparison.identical ? (
              <div className="text-green-600 font-medium">✓ JSON objects are identical</div>
            ) : (
              <div>
                <div className="text-red-600 font-medium mb-3">
                  ✗ JSON objects are different ({comparison.differences.length} differences found)
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {comparison.differences.map(renderDifference)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
