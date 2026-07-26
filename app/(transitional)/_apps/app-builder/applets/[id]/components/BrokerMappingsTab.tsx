'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BrokerMapping } from '../page';

interface BrokerMappingsTabProps {
  brokerMap?: BrokerMapping[];
}

export default function BrokerMappingsTab({ brokerMap = [] }: BrokerMappingsTabProps) {
  if (brokerMap.length === 0) {
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <p className="text-gray-500 dark:text-gray-400">No broker mappings defined for this applet.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">Applet ID</TableHead>
              <TableHead className="w-1/3">Field ID</TableHead>
              <TableHead className="w-1/3">Broker ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brokerMap.map((mapping, index) => (
              <TableRow key={index}>
                <TableCell className="font-mono text-xs">{mapping.appletId}</TableCell>
                <TableCell className="font-mono text-xs">{mapping.fieldId}</TableCell>
                <TableCell className="font-mono text-xs">{mapping.brokerId}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
} 