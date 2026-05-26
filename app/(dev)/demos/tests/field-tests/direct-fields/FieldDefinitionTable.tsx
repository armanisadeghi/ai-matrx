"use client";

import { FieldDefinition } from "@/types/customAppTypes";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import React from "react";

interface FieldDefinitionTableProps {
  fields: FieldDefinition[];
}

export default function FieldDefinitionTable({ fields }: FieldDefinitionTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (fieldId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(fieldId)) {
      newExpanded.delete(fieldId);
    } else {
      newExpanded.add(fieldId);
    }
    setExpandedRows(newExpanded);
  };

  const hasExpandableContent = (field: FieldDefinition) => {
    return (field.options && field.options.length > 0) || 
           (field.componentProps && Object.keys(field.componentProps).length > 0) ||
           (field.componentProps?.tableRules && Object.keys(field.componentProps.tableRules).length > 0);
  };

  const getActivePropsCount = (componentProps: any) => {
    if (!componentProps) return 0;
    return Object.values(componentProps).filter(value => 
      value !== undefined && value !== null && value !== "" && value !== false
    ).length;
  };

  const formatValue = (value: any): string => {
    if (value === undefined || value === null) return "-";
    if (typeof value === "boolean") return value ? "✓" : "✗";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="text-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>ID</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Component</TableHead>
            <TableHead className="text-center">Required</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Help Text</TableHead>
            <TableHead>Placeholder</TableHead>
            <TableHead className="text-center">Options</TableHead>
            <TableHead className="text-center">Props</TableHead>
            <TableHead>Default Value</TableHead>
            <TableHead className="text-center">Include Other</TableHead>
            <TableHead>Group</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field, index) => {
            const fieldKey = field.id || `field-${index}`;
            const isExpanded = expandedRows.has(fieldKey);
            const canExpand = hasExpandableContent(field);
            
            return (
              <React.Fragment key={fieldKey}>
                <TableRow className="hover:bg-muted/50">
                  <TableCell className="p-1">
                    {canExpand && (
                      <button
                        onClick={() => toggleRow(fieldKey)}
                        className="p-1 hover:bg-muted rounded"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="p-1 font-mono">{field.id || "-"}</TableCell>
                  <TableCell className="p-1">{field.label || "-"}</TableCell>
                  <TableCell className="p-1 font-mono">{field.component}</TableCell>
                  <TableCell className="p-1 text-center">
                    {field.required ? (
                      <span className="text-red-600 dark:text-red-400 font-bold">✓</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="p-1">{field.description || "-"}</TableCell>
                  <TableCell className="p-1">{field.helpText || "-"}</TableCell>
                  <TableCell className="p-1">{field.placeholder || "-"}</TableCell>
                  <TableCell className="p-1 text-center">
                    {field.options ? (
                      <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded text-xs">
                        {field.options.length}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="p-1 text-center">
                    {getActivePropsCount(field.componentProps) > 0 ? (
                      <span className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-1 rounded text-xs">
                        {getActivePropsCount(field.componentProps)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="p-1 font-mono">
                    {field.defaultValue !== undefined ? (
                      <span className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-1 rounded text-xs">
                        {formatValue(field.defaultValue)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="p-1 text-center">
                    {field.includeOther ? (
                      <span className="text-purple-600 dark:text-purple-400 font-bold">✓</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="p-1">{field.group || "-"}</TableCell>
                </TableRow>
                
                {/* Expanded row content */}
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={13} className="p-0 bg-muted/20">
                      <div className="p-4 space-y-4">
                        {/* Options section */}
                        {field.options && field.options.length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2 text-sm">Options ({field.options.length})</h4>
                            <div className="grid grid-cols-1 gap-2">
                              {field.options.map((option, optionIndex) => (
                                <div key={option.id || optionIndex} className="bg-background p-2 rounded border">
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div><strong>ID:</strong> {option.id}</div>
                                    <div><strong>Label:</strong> {option.label}</div>
                                    {option.description && <div><strong>Description:</strong> {option.description}</div>}
                                    {option.helpText && <div><strong>Help Text:</strong> {option.helpText}</div>}
                                    {option.iconName && <div><strong>Icon:</strong> {option.iconName}</div>}
                                    {option.parentId && <div><strong>Parent ID:</strong> {option.parentId}</div>}
                                    {option.order !== undefined && <div><strong>Order:</strong> {option.order}</div>}
                                    {option.metadata && <div><strong>Metadata:</strong> {JSON.stringify(option.metadata)}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Component Props section */}
                        {field.componentProps && Object.keys(field.componentProps).length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2 text-sm">Component Properties</h4>
                            <div className="bg-background p-2 rounded border">
                              <div className="grid grid-cols-4 gap-2 text-xs">
                                {Object.entries(field.componentProps).map(([key, value]) => (
                                  value !== undefined && value !== null && value !== "" && key !== 'tableRules' && (
                                    <div key={key}>
                                      <strong>{key}:</strong> {formatValue(value)}
                                    </div>
                                  )
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Table Rules section */}
                        {field.componentProps?.tableRules && Object.keys(field.componentProps.tableRules).length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2 text-sm">Table Rules</h4>
                            <div className="bg-background p-2 rounded border">
                              <div className="grid grid-cols-4 gap-2 text-xs">
                                {Object.entries(field.componentProps.tableRules).map(([key, value]) => (
                                  value !== undefined && value !== null && (
                                    <div key={key} className="flex items-center gap-1">
                                      <strong>{key}:</strong> 
                                      {typeof value === 'boolean' ? (
                                        <span className={`px-1 py-0.5 rounded text-xs font-medium ${
                                          value 
                                            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                                            : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                                        }`}>
                                          {value ? 'Allowed' : 'Disabled'}
                                        </span>
                                      ) : (
                                        formatValue(value)
                                      )}
                                    </div>
                                  )
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
