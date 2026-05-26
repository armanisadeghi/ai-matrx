'use client';

import React from 'react';
import { SqlFunction, SqlFunctionSort } from '@/types/sql-functions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { 
  Check, 
  Info, 
  Edit, 
  Trash2, 
  ArrowUpDown, 
  Shield, 
  ShieldAlert, 
  ArrowUp, 
  ArrowDown 
} from 'lucide-react';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface SqlFunctionsListProps {
  functions: SqlFunction[];
  loading: boolean;
  onViewDetails: (func: SqlFunction) => void;
  onEditFunction: (func: SqlFunction) => void;
  onDeleteFunction: (schema: string, name: string, argumentTypes: string) => Promise<boolean>;
  onSortChange: (field: SqlFunctionSort['field']) => void;
  sortField: SqlFunctionSort['field'];
  sortDirection: SqlFunctionSort['direction'];
}

export default function SqlFunctionsList({
  functions,
  loading,
  onViewDetails,
  onEditFunction,
  onDeleteFunction,
  onSortChange,
  sortField,
  sortDirection,
}: SqlFunctionsListProps) {
  // Helper function to handle sort click
  const handleSortClick = (field: SqlFunctionSort['field']) => {
    onSortChange(field);
  };

  // Helper function to render the sort indicator
  const renderSortIndicator = (field: SqlFunctionSort['field']) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-4 w-4" />;
    }
    return sortDirection === 'asc' ? 
      <ArrowUp className="ml-1 h-4 w-4" /> : 
      <ArrowDown className="ml-1 h-4 w-4" />;
  };

  // Function to handle delete confirmation
  const handleDelete = async (func: SqlFunction) => {
    await onDeleteFunction(func.schema, func.name, func.arguments);
  };

  // Function to handle row click
  const handleRowClick = (func: SqlFunction) => {
    onViewDetails(func);
  };

  return (
    <div className="border rounded-md">
      <div className="relative w-full overflow-auto">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-800">
            <TableRow>
              <TableHead 
                className="cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                onClick={() => handleSortClick('name')}
              >
                <div className="flex items-center">
                  Function Name
                  {renderSortIndicator('name')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                onClick={() => handleSortClick('schema')}
              >
                <div className="flex items-center">
                  Schema
                  {renderSortIndicator('schema')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                onClick={() => handleSortClick('security_type')}
              >
                <div className="flex items-center">
                  Security
                  {renderSortIndicator('security_type')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                onClick={() => handleSortClick('arguments')}
              >
                <div className="flex items-center">
                  Arguments
                  {renderSortIndicator('arguments')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                onClick={() => handleSortClick('returns')}
              >
                <div className="flex items-center">
                  Returns
                  {renderSortIndicator('returns')}
                </div>
              </TableHead>
              <TableHead className="text-right text-slate-700 dark:text-slate-300 w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700 dark:border-slate-300"></div>
                  </div>
                  <div className="mt-2 text-slate-500 dark:text-slate-400">Loading SQL functions...</div>
                </TableCell>
              </TableRow>
            ) : functions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="text-slate-500 dark:text-slate-400">No SQL functions found</div>
                  <div className="mt-2 text-sm text-slate-400 dark:text-slate-500">
                    Try adjusting your search or filter criteria
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              functions.map((func, index) => (
                <TableRow 
                  key={`${func.schema}.${func.name}.${index}`}
                  className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                  onClick={() => handleRowClick(func)}
                >
                  <TableCell className="font-medium text-slate-800 dark:text-slate-200">{func.name}</TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400">{func.schema}</TableCell>
                  <TableCell>
                    {func.security_type === 'SECURITY DEFINER' ? (
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <ShieldAlert className="h-4 w-4" /> Definer
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                        <Shield className="h-4 w-4" /> Invoker
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400 max-w-[200px] truncate" title={func.arguments}>
                    {func.arguments}
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400 max-w-[200px] truncate" title={func.returns}>
                    {func.returns}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end space-x-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditFunction(func);
                        }}
                        className="text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => e.stopPropagation()}
                            className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-slate-900 dark:text-slate-100">
                              Delete SQL Function
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-500 dark:text-slate-400">
                              Are you sure you want to delete the function <span className="font-semibold text-slate-700 dark:text-slate-300">{func.schema}.{func.name}</span>? 
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction 
                              className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                              onClick={() => handleDelete(func)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
} 