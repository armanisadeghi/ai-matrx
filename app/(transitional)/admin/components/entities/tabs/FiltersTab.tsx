// app/admin/components/entity-testing/tabs/FiltersTab.tsx
'use client';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

const FiltersTab = ({ entity, filterValue, setFilterValue, sortField, setSortField, sortDirection, setSortDirection }) => {
    return (
        <div className="space-y-4">
            <div className="flex space-x-4">
                <div className="flex-1">
                    <Input
                        placeholder="Filter value..."
                        value={filterValue}
                        onChange={(e) => setFilterValue(e.target.value)}
                    />
                </div>
                <Select value={sortField} onValueChange={setSortField}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Sort by..." />
                    </SelectTrigger>
                    <SelectContent>
                        {entity.entityMetadata?.fields.map(field => (
                            <SelectItem key={field.name} value={field.name}>
                                {field.displayName}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={sortDirection} onValueChange={(value: 'asc' | 'desc') => setSortDirection(value)}>
                    <SelectTrigger className="w-[100px]">
                        <SelectValue placeholder="Direction" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="asc">Asc</SelectItem>
                        <SelectItem value="desc">Desc</SelectItem>
                    </SelectContent>
                </Select>
                <Button
                    onClick={() => {
                        entity.setSorting({
                            field: sortField,
                            direction: sortDirection,
                        });
                    }}
                >
                    Apply
                </Button>
            </div>
        </div>
    );
};

export default FiltersTab;
