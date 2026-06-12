"use client";
import React, { useEffect, useState, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell
} from "@/components/ui/table";

// Copy to clipboard icon
const CopyIcon = ({ className = "" }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="16" 
    height="16" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

interface TypeScriptError {
  file: string | null;
  line: number | null;
  column: number | null;
  message: string;
  code: number;
}

interface SortConfig {
  key: keyof TypeScriptError | null;
  direction: 'ascending' | 'descending';
}

const TypeScriptErrorViewer: React.FC = () => {
  const [allErrors, setAllErrors] = useState<TypeScriptError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedError, setExpandedError] = useState<{message: string, index: number} | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [errorsPerPage, setErrorsPerPage] = useState<number>(25);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'ascending' });
  const [filterText, setFilterText] = useState<string>('');
  const [fileFilter, setFileFilter] = useState<string>('');
  const [codeFilter, setCodeFilter] = useState<string>('');
  const [directoryFilter, setDirectoryFilter] = useState<string>('');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [showCopySuccessToast, setShowCopySuccessToast] = useState<boolean>(false);
  
  const MAX_ERROR_LENGTH = 500;

  const fetchErrors = async () => {
    // Only fetch if we haven't already
    if (allErrors.length === 0 && !error) {
      setLoading(true);
      try {
        const response = await fetch('/type_errors.json', {
          cache: 'force-cache', // Use cached version if available
        });
        if (!response.ok) {
          throw new Error('Failed to fetch TypeScript errors');
        }
        const data = await response.json();
        setAllErrors(data);
        setError(null);
      } catch (err) {
        setError('Error loading TypeScript errors. Ensure type_errors.json exists in the public directory.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  // Force a refetch only when the refresh button is clicked
  const refreshErrors = async () => {
    setLoading(true);
    try {
      // Call API to regenerate TypeScript errors
      const regenerateResponse = await fetch('/api/admin/typescript-errors/regenerate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!regenerateResponse.ok) {
        const errorData = await regenerateResponse.json();
        throw new Error(errorData.error || 'Failed to regenerate TypeScript errors');
      }

      const result = await regenerateResponse.json();
      
      // Set the errors from the API response
      setAllErrors(result.errors);
      setError(null);
      
      console.log(`✓ TypeScript errors refreshed: ${result.count} errors found`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Error regenerating TypeScript errors: ${errorMessage}`);
      console.error('Refresh error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchErrors();
    // No interval needed as we're not polling anymore
  }, []);

  const truncateMessage = (message: string) => {
    if (message.length <= MAX_ERROR_LENGTH) return message;
    return `${message.substring(0, MAX_ERROR_LENGTH)}...`;
  };

  const requestSort = (key: keyof TypeScriptError) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // Apply filtering and sorting
  const filteredAndSortedErrors = useMemo(() => {
    let result = [...allErrors];
    
    // Apply filters
    if (filterText) {
      const lowerFilter = filterText.toLowerCase();
      result = result.filter(err => 
        (err.message?.toLowerCase().includes(lowerFilter) || 
        (err.file?.toLowerCase().includes(lowerFilter)))
      );
    }
    
    if (fileFilter) {
      const lowerFileFilter = fileFilter.toLowerCase();
      result = result.filter(err => 
        err.file?.toLowerCase().includes(lowerFileFilter)
      );
    }
    
    if (directoryFilter) {
      result = result.filter(err => 
        err.file?.startsWith(directoryFilter)
      );
    }
    
    if (codeFilter) {
      result = result.filter(err => 
        err.code.toString().includes(codeFilter)
      );
    }
    
    // Apply sorting
    if (sortConfig.key) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];
        
        if (aValue === null) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (bValue === null) return sortConfig.direction === 'ascending' ? 1 : -1;
        
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending' 
            ? aValue.localeCompare(bValue) 
            : bValue.localeCompare(aValue);
        }
        
        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    
    return result;
  }, [allErrors, filterText, fileFilter, directoryFilter, codeFilter, sortConfig]);
  
  // Get unique file names for filter dropdown
  const uniqueFiles = useMemo(() => {
    const fileSet = new Set<string>();
    allErrors.forEach(err => {
      if (err.file) fileSet.add(err.file);
    });
    return Array.from(fileSet).sort();
  }, [allErrors]);
  
  // Get unique directories for filter dropdown
  const uniqueDirectories = useMemo(() => {
    const dirSet = new Set<string>();
    allErrors.forEach(err => {
      if (err.file) {
        // Extract directory path (everything before the last slash)
        const lastSlashIndex = Math.max(
          err.file.lastIndexOf('/'), 
          err.file.lastIndexOf('\\')
        );
        if (lastSlashIndex > 0) {
          dirSet.add(err.file.substring(0, lastSlashIndex));
        }
      }
    });
    return Array.from(dirSet).sort();
  }, [allErrors]);
  
  // Get unique error codes for filter dropdown
  const uniqueCodes = useMemo(() => {
    const codeSet = new Set<number>();
    allErrors.forEach(err => {
      codeSet.add(err.code);
    });
    return Array.from(codeSet).sort((a, b) => a - b);
  }, [allErrors]);
  
  // Function to copy text to clipboard
  const copyToClipboard = (text: string, item: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedItem(item);
      setShowCopySuccessToast(true);
      setTimeout(() => {
        setShowCopySuccessToast(false);
        setCopiedItem(null);
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };
  
  // Function to copy all error codes to clipboard
  const copyAllErrorCodes = () => {
    const codesList = uniqueCodes.map(code => `TS${code}`).join('\n');
    copyToClipboard(codesList, 'all-codes');
  };
  
  // Function to copy row data
  const copyRowData = (err: TypeScriptError) => {
    const location = err.line ? `Line ${err.line}${err.column ? `, Column ${err.column}` : ''}` : 'N/A';
    const rowText = `File: ${err.file || 'Unknown'}\nLocation: ${location}\nCode: TS${err.code}\nMessage: ${err.message}`;
    copyToClipboard(rowText, `row-${err.file}-${err.line}`);
  };

  // Calculate pagination
  const indexOfLastError = currentPage * errorsPerPage;
  const indexOfFirstError = indexOfLastError - errorsPerPage;
  const currentErrors = filteredAndSortedErrors.slice(indexOfFirstError, indexOfLastError);
  const totalPages = Math.ceil(filteredAndSortedErrors.length / errorsPerPage);

  // Change page
  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);
  
  // Clear all filters
  const clearFilters = () => {
    setFilterText('');
    setDirectoryFilter('');
    setCodeFilter('');
    setSortConfig({ key: null, direction: 'ascending' });
  };

  const getSortIndicator = (column: keyof TypeScriptError) => {
    if (sortConfig.key !== column) return null;
    return sortConfig.direction === 'ascending' ? ' ↑' : ' ↓';
  };

  return (
    <div className="p-4 bg-slate-100 dark:bg-slate-900 min-h-dvh text-slate-800 dark:text-slate-200 w-full">
      <div className="w-full">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">TypeScript Errors</h1>
          <button 
            onClick={refreshErrors}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors 
                     disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Regenerating...
              </>
            ) : (
              'Regenerate Errors'
            )}
          </button>
        </div>

        {loading && allErrors.length === 0 ? (
          <div className="flex justify-center items-center p-12">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-3 text-lg">Loading errors...</span>
          </div>
        ) : (
          <>
            {error && (
              <div className="p-4 mb-6 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-md text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
            
            {!loading && allErrors.length === 0 && !error && (
              <div className="p-4 mb-6 bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-800 rounded-md text-green-700 dark:text-green-300">
                No TypeScript errors found.
              </div>
            )}

            {allErrors.length > 0 && (
              <>
                {/* Filters */}
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-md mb-4">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold mb-2">Filters</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Search</label>
                        <input 
                          type="text"
                          value={filterText}
                          onChange={(e) => {
                            setFilterText(e.target.value);
                            setCurrentPage(1);
                          }}
                          placeholder="Search messages or files..."
                          className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md 
                                    bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Directory</label>
                        <select
                          value={directoryFilter}
                          onChange={(e) => {
                            setDirectoryFilter(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md
                                    bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        >
                          <option value="">All Directories</option>
                          {uniqueDirectories.map(dir => (
                            <option key={dir} value={dir}>{dir}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">File</label>
                        <select
                          value={fileFilter}
                          onChange={(e) => {
                            setFileFilter(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md
                                    bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        >
                          <option value="">All Files</option>
                          {uniqueFiles.map(file => (
                            <option key={file} value={file}>{file}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Error Code</label>
                        <div className="flex">
                          <select
                            value={codeFilter}
                            onChange={(e) => {
                              setCodeFilter(e.target.value);
                              setCurrentPage(1);
                            }}
                            className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-l-md
                                      bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          >
                            <option value="">All Codes</option>
                            {uniqueCodes.map(code => (
                              <option key={code} value={code.toString()}>TS{code}</option>
                            ))}
                          </select>
                          <button
                            onClick={copyAllErrorCodes}
                            title="Copy all error codes"
                            className="flex items-center justify-center px-2 border border-l-0 border-slate-300 dark:border-slate-600 rounded-r-md
                                     bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                          >
                            <CopyIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <button
                      onClick={clearFilters}
                      className="px-3 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 
                               rounded-md text-sm transition-colors"
                    >
                      Clear Filters
                    </button>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Found {filteredAndSortedErrors.length} of {allErrors.length} errors
                    </div>
                  </div>
                </div>

                {/* Error Table */}
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-auto mb-4 max-h-[600px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white dark:bg-slate-800 z-10">
                      <TableRow className="border-b border-slate-200 dark:border-slate-700">
                        <TableHead 
                          className="text-slate-700 dark:text-slate-300 cursor-pointer bg-white dark:bg-slate-800"
                          onClick={() => requestSort('file')}
                        >
                          File {getSortIndicator('file')}
                        </TableHead>
                        <TableHead className="text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800">
                          Location
                        </TableHead>
                        <TableHead 
                          className="text-slate-700 dark:text-slate-300 cursor-pointer bg-white dark:bg-slate-800"
                          onClick={() => requestSort('code')}
                        >
                          Error Code {getSortIndicator('code')}
                        </TableHead>
                        <TableHead className="text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800">
                          Message
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentErrors.map((err, index) => (
                        <TableRow 
                          key={indexOfFirstError + index} 
                          className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 relative group"
                        >
                          <TableCell className="font-medium">
                            <div className="group flex items-center">
                              <span className="mr-2">{err.file || 'Unknown'}</span>
                              <button
                                onClick={() => copyToClipboard(err.file || 'Unknown', `file-${index}`)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Copy file path"
                              >
                                <CopyIcon />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="group flex items-center">
                              <span className="mr-2">
                                {err.line ? `Line ${err.line}` : 'N/A'}
                                {err.line && err.column ? `, Column ${err.column}` : ''}
                              </span>
                              <button
                                onClick={() => copyToClipboard(
                                  `${err.line ? `Line ${err.line}` : 'N/A'}${err.line && err.column ? `, Column ${err.column}` : ''}`, 
                                  `loc-${index}`
                                )}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Copy location"
                              >
                                <CopyIcon />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="group flex items-center">
                              <span className="mr-2">TS{err.code}</span>
                              <button
                                onClick={() => copyToClipboard(`TS${err.code}`, `code-${index}`)}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Copy error code"
                              >
                                <CopyIcon />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="group">
                              <div className="flex justify-between">
                                <p className="mr-2">{truncateMessage(err.message)}</p>
                                <button
                                  onClick={() => copyToClipboard(err.message, `msg-${index}`)}
                                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2"
                                  title="Copy message"
                                >
                                  <CopyIcon />
                                </button>
                              </div>
                              <div className="flex justify-between items-center mt-1">
                                {err.message.length > MAX_ERROR_LENGTH && (
                                  <button
                                    onClick={() => setExpandedError({ 
                                      message: err.message, 
                                      index: indexOfFirstError + index 
                                    })}
                                    className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                                  >
                                    Show full message
                                  </button>
                                )}
                                <button
                                  onClick={() => copyRowData(err)}
                                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-sm opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                                  title="Copy all row data"
                                >
                                  Copy row
                                </button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-between items-center">
                    <div>
                      <select
                        value={errorsPerPage}
                        onChange={(e) => {
                          setErrorsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="p-2 border border-slate-300 dark:border-slate-600 rounded-md
                                 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      >
                        <option value={10}>10 per page</option>
                        <option value={25}>25 per page</option>
                        <option value={50}>50 per page</option>
                        <option value={100}>100 per page</option>
                      </select>
                    </div>
                    
                    <div className="flex space-x-2">
                      <button
                        onClick={() => paginate(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 
                                 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      
                      <div className="flex items-center px-2">
                        Page {currentPage} of {totalPages}
                      </div>
                      
                      <button
                        onClick={() => paginate(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 
                                 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Full error message overlay */}
      {expandedError && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setExpandedError(null)}
        >
          <div 
            className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg max-w-3xl w-full max-h-[80dvh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">
                Error Details {allErrors[expandedError.index]?.file && `(${allErrors[expandedError.index].file})`}
              </h3>
              <div className="flex">
                <button 
                  onClick={() => copyToClipboard(expandedError.message, 'expanded-error')}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mr-2"
                  title="Copy full error message"
                >
                  <CopyIcon />
                </button>
                <button 
                  onClick={() => setExpandedError(null)}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>
            <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-md overflow-auto whitespace-pre-wrap font-mono text-sm">
              {expandedError.message}
            </div>
          </div>
        </div>
      )}
      
      {/* Success toast notification */}
      {showCopySuccessToast && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg z-50 animate-fade-in">
          Copied to clipboard
        </div>
      )}
    </div>
  );
};

export default TypeScriptErrorViewer;