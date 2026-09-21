'use client';
import React, { useMemo } from 'react';
import { DatabaseEnum, EnumSort } from '@/types/enum-types';
import type { EnumDetailTab } from './EnumDetail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Database, Edit, List, Trash2 } from 'lucide-react';
import { MatrxDataTable } from '@ai-matrx/design-system/data-table';
import type { MatrxColumnDef } from '@ai-matrx/design-system/data-table/types';
import { confirm } from '@/components/dialogs/confirm/ConfirmDialogHost';
interface EnumsListProps { enums: DatabaseEnum[]; loading: boolean; onViewDetails: (value: DatabaseEnum, tab?: EnumDetailTab) => void; onEditEnum: (value: DatabaseEnum) => void; onDeleteEnum: (schema: string, name: string) => Promise<boolean>; onSortChange: (field: EnumSort['field']) => void; sortField: EnumSort['field']; sortDirection: EnumSort['direction']; }
const valuesText = (values: string[]) => values.length <= 3 ? values.join(', ') : `${values.slice(0, 3).join(', ')} (+${values.length - 3} more)`;
export default function EnumsList({ enums, loading, onViewDetails, onEditEnum, onDeleteEnum }: EnumsListProps) {
 const columns = useMemo((): MatrxColumnDef<DatabaseEnum>[] => [
  { id: 'name', header: 'Enum name', accessorKey: 'name', width: 240, cell: (row) => <button type="button" className="inline-flex items-center gap-2 font-medium hover:text-primary" onClick={() => onViewDetails(row)}><List className="h-4 w-4" />{row.name}</button> },
  { id: 'schema', header: 'Schema', accessorKey: 'schema', filter: 'select', width: 160, cell: (row) => <span className="inline-flex items-center gap-1"><Database className="h-4 w-4 text-muted-foreground" />{row.schema}</span> },
  { id: 'values_count', header: 'Values', accessorFn: (row) => row.values.length, filter: 'number', width: 100, cell: (row) => <Badge variant="outline">{row.values.length}</Badge> },
  { id: 'values', header: 'Value preview', accessorFn: (row) => row.values.join(' '), width: 280, cell: (row) => <span className="block truncate" title={row.values.join(', ')}>{valuesText(row.values)}</span> },
  { id: 'usage_count', header: 'Usage', accessorFn: (row) => row.usage_count ?? -1, filter: 'number', width: 110, cell: (row) => row.usage_count == null ? <Badge variant="secondary">Unknown</Badge> : <button type="button" className="rounded focus-visible:ring-2" onClick={() => onViewDetails(row, 'usage')}><Badge variant={row.usage_count > 0 ? 'default' : 'secondary'}>{row.usage_count} tables</Badge></button> },
 ], [onDeleteEnum, onEditEnum, onViewDetails]);
 return <MatrxDataTable urlState={{ id: 'database-enums', defaultSort: { id: 'name', direction: 'asc' } }} data={enums} columns={columns} getRowId={(row) => `${row.schema}.${row.name}`} isLoading={loading} pageSize={25} hideToolbar emptyState={{ title: 'No enums found' }} onRowOpen={(row) => onViewDetails(row)} rowActions={(row) => <><Button variant="ghost" size="icon" aria-label={`Edit ${row.name}`} onClick={() => onEditEnum(row)}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${row.name}`} className="text-destructive" onClick={async () => { if (await confirm({ title: 'Delete enum?', description: `Delete ${row.schema}.${row.name}. This cannot be undone.`, confirmLabel: 'Delete', variant: 'destructive' })) await onDeleteEnum(row.schema, row.name); }}><Trash2 className="h-4 w-4" /></Button></>} detail={{ enabled: false }} />;
}
