'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BrokerMapping } from '../../page';

interface BrokerMappingsEditTabProps {
  brokerMap?: BrokerMapping[];
  onUpdate: (brokerMap: BrokerMapping[]) => void;
}

export default function BrokerMappingsEditTab({ brokerMap = [], onUpdate }: BrokerMappingsEditTabProps) {
  // Placeholder for broker mapping functionality
  const handleAddMapping = () => {
    console.log('Add mapping clicked');
    // In a real implementation, this would add a new mapping
  };

  const handleRemoveMapping = (index: number) => {
    console.log('Remove mapping clicked', index);
    // In a real implementation, this would remove the mapping
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
            Broker Mappings ({brokerMap.length})
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Connect fields to data sources through broker mappings.
          </p>
        </div>
        
        <Button onClick={handleAddMapping}>
          <Plus className="h-4 w-4 mr-2" /> Add Mapping
        </Button>
      </div>

      {brokerMap.length === 0 ? (
        <Card className="p-6 flex flex-col items-center justify-center h-64">
          <p className="text-gray-500 dark:text-gray-400 mb-4">No broker mappings defined for this applet.</p>
          <Button onClick={handleAddMapping}>
            <Plus className="h-4 w-4 mr-2" /> Create First Mapping
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/4">Applet ID</TableHead>
                <TableHead className="w-1/4">Field ID</TableHead>
                <TableHead className="w-1/4">Broker ID</TableHead>
                <TableHead className="w-1/4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brokerMap.map((mapping, index) => (
                <TableRow key={index}>
                  <TableCell className="font-mono text-xs">{mapping.appletId}</TableCell>
                  <TableCell className="font-mono text-xs">{mapping.fieldId}</TableCell>
                  <TableCell className="font-mono text-xs">{mapping.brokerId}</TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0 text-red-500"
                      onClick={() => handleRemoveMapping(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
} 