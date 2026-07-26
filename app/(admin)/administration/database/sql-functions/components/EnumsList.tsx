'use client';

import React from 'react';
import { DatabaseEnum, EnumSort } from '@/types/enum-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Info, 
  Edit, 
  Trash2, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  Database,
  List
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

interface EnumsListProps {
  enums: DatabaseEnum[];
  loading: boolean;
  onViewDetails: (enumType: DatabaseEnum) => void;
  onEditEnum: (enumType: DatabaseEnum) => void;
  onDeleteEnum: (schema: string, name: string) => Promise<boolean>;
  onSortChange: (field: EnumSort['field']) => void;
  sortField: EnumSort['field'];
  sortDirection: EnumSort['direction'];
}

export default function EnumsList({
  enums,
  loading,
  onViewDetails,
  onEditEnum,
  onDeleteEnum,
  onSortChange,
  sortField,
  sortDirection,
}: EnumsListProps) {
  // Helper function to handle sort click
  const handleSortClick = (field: EnumSort['field']) => {
    onSortChange(field);
  };

  // Helper function to render the sort indicator
  const renderSortIndicator = (field: EnumSort['field']) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-4 w-4" />;
    }
    return sortDirection === 'asc' ? 
      <ArrowUp className="ml-1 h-4 w-4" /> : 
      <ArrowDown className="ml-1 h-4 w-4" />;
  };

  // Function to handle delete confirmation
  const handleDelete = async (enumType: DatabaseEnum) => {
    await onDeleteEnum(enumType.schema, enumType.name);
  };

  // Function to handle row click
  const handleRowClick = (enumType: DatabaseEnum) => {
    onViewDetails(enumType);
  };

  // Function to truncate values for display
  const formatValues = (values: string[], maxDisplay: number = 3) => {
    if (values.length <= maxDisplay) {
      return values.join(', ');
    }
    return `${values.slice(0, maxDisplay).join(', ')} (+${values.length - maxDisplay} more)`;
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
                  Enum Name
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
                onClick={() => handleSortClick('values_count')}
              >
                <div className="flex items-center">
                  Values Count
                  {renderSortIndicator('values_count')}
                </div>
              </TableHead>
              <TableHead className="text-slate-700 dark:text-slate-300">
                Values
              </TableHead>
              <TableHead 
                className="cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                onClick={() => handleSortClick('usage_count')}
              >
                <div className="flex items-center">
                  Usage
                  {renderSortIndicator('usage_count')}
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
                  <div className="mt-2 text-slate-500 dark:text-slate-400">Loading enums...</div>
                </TableCell>
              </TableRow>
            ) : enums.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="text-slate-500 dark:text-slate-400">No enums found</div>
                  <div className="mt-2 text-sm text-slate-400 dark:text-slate-500">
                    Try adjusting your search or filter criteria
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              enums.map((enumType, index) => (
                <TableRow 
                  key={`${enumType.schema}.${enumType.name}.${index}`}
                  className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                  onClick={() => handleRowClick(enumType)}
                >
                  <TableCell className="font-medium text-slate-800 dark:text-slate-200">
                    <div className="flex items-center gap-2">
                      <List className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      {enumType.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1">
                      <Database className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      {enumType.schema}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400">
                    <Badge variant="outline" className="text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700">
                      {enumType.values.length}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400 max-w-[300px]">
                    <div className="truncate" title={enumType.values.join(', ')}>
                      {formatValues(enumType.values)}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400">
                    {enumType.usage_count !== undefined ? (
                      <Badge 
                        variant={enumType.usage_count > 0 ? "default" : "secondary"}
                        className={enumType.usage_count > 0 
                          ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800" 
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700"
                        }
                      >
                        {enumType.usage_count} tables
                      </Badge>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">Unknown</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end space-x-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditEnum(enumType);
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
                              Delete Enum Type
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-500 dark:text-slate-400">
                              Are you sure you want to delete the enum type <span className="font-semibold text-slate-700 dark:text-slate-300">{enumType.schema}.{enumType.name}</span>? 
                              This action cannot be undone and will fail if the enum is currently in use.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction 
                              className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                              onClick={() => handleDelete(enumType)}
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