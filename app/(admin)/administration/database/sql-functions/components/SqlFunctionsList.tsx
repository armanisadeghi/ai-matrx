'use client';
import React, { useMemo } from 'react';
import { SqlFunction, SqlFunctionSort } from '@/types/sql-functions';
import { Button } from '@/components/ui/button';
import { Edit, Shield, ShieldAlert, Trash2 } from 'lucide-react';
import { MatrxDataTable } from '@ai-matrx/design-system/data-table';
import type { MatrxColumnDef } from '@ai-matrx/design-system/data-table/types';
import { getSqlFunctionKey } from '../utils/functionIdentity';
import { confirm } from '@/components/dialogs/confirm/ConfirmDialogHost';
interface SqlFunctionsListProps { functions: SqlFunction[]; loading: boolean; selectedFunctionKey?: string | null; onViewDetails: (func: SqlFunction) => void; onEditFunction: (func: SqlFunction) => void; onDeleteFunction: (schema: string, name: string, argumentTypes: string) => Promise<boolean>; onSortChange: (field: SqlFunctionSort['field']) => void; sortField: SqlFunctionSort['field']; sortDirection: SqlFunctionSort['direction']; }
export default function SqlFunctionsList({ functions, loading, selectedFunctionKey, onViewDetails, onEditFunction, onDeleteFunction }: SqlFunctionsListProps) {
  const columns = useMemo((): MatrxColumnDef<SqlFunction>[] => [
    { id: 'name', header: 'Function name', accessorKey: 'name', width: 240, cell: (row) => <button type="button" className="font-medium hover:text-primary" onClick={() => onViewDetails(row)}>{row.name}</button> },
    { id: 'schema', header: 'Schema', accessorKey: 'schema', filter: 'select', width: 140 },
    { id: 'security_type', header: 'Security', accessorKey: 'security_type', filter: 'select', width: 145, cell: (row) => row.security_type === 'SECURITY DEFINER' ? <span className="inline-flex items-center gap-1"><ShieldAlert className="h-4 w-4 text-amber-600" />Definer</span> : <span className="inline-flex items-center gap-1"><Shield className="h-4 w-4 text-muted-foreground" />Invoker</span> },
    { id: 'arguments', header: 'Arguments', accessorKey: 'arguments', width: 220, cell: (row) => <code className="block truncate text-xs" title={row.arguments}>{row.arguments}</code> },
    { id: 'returns', header: 'Returns', accessorKey: 'returns', width: 220, cell: (row) => <code className="block truncate text-xs" title={row.returns}>{row.returns}</code> },
    { id: 'actions', header: 'Actions', accessorFn: (row) => row.name, sortable: false, filter: false, width: 100, cell: (row) => <div className="flex justify-end gap-1"><Button variant="ghost" size="icon" aria-label={`Edit ${row.name}`} onClick={(event) => { event.stopPropagation(); onEditFunction(row); }}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${row.name}`} className="text-destructive" onClick={async (event) => { event.stopPropagation(); if (await confirm({ title: 'Delete SQL function?', description: `Delete ${row.schema}.${row.name}. This cannot be undone.`, confirmLabel: 'Delete', variant: 'destructive' })) await onDeleteFunction(row.schema, row.name, row.arguments); }}><Trash2 className="h-4 w-4" /></Button></div> },
  ], [onDeleteFunction, onEditFunction, onViewDetails]);
  return <MatrxDataTable urlState={{ id: 'sql-functions' }} data={functions} columns={columns} getRowId={getSqlFunctionKey} isLoading={loading} pageSize={25} emptyState={{ title: 'No SQL functions found' }} rowClassName={(row) => selectedFunctionKey === getSqlFunctionKey(row) ? 'bg-primary/10' : undefined} onRowOpen={(row) => onViewDetails(row)} toolbar={{ search: true, searchPlaceholder: 'Search loaded functions…' }} detail={{ enabled: false }} />;
}
