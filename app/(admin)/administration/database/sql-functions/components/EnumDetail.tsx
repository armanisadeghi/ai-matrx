'use client';

import React, { useState, useEffect } from 'react';
import { DatabaseEnum, EnumUsage } from '@/types/enum-types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  X, 
  Edit, 
  Trash2, 
  List, 
  Database,
  Calendar, 
  User, 
  Copy, 
  Maximize2, 
  Minimize2,
  Check,
  ExternalLink
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useEnums } from '@/lib/hooks/useEnums';

interface EnumDetailProps {
  enumType: DatabaseEnum;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function EnumDetail({ enumType, onClose, onEdit, onDelete }: EnumDetailProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [isCopied, setIsCopied] = useState(false);
  const [enumUsage, setEnumUsage] = useState<EnumUsage[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  
  const { getEnumUsage } = useEnums();

  // Load enum usage when component mounts or tab changes
  useEffect(() => {
    if (activeTab === 'usage') {
      loadEnumUsage();
    }
  }, [activeTab, enumType]);

  const loadEnumUsage = async () => {
    setLoadingUsage(true);
    try {
      const usage = await getEnumUsage(enumType.schema, enumType.name);
      setEnumUsage(usage);
    } catch (error) {
      console.error('Error loading enum usage:', error);
    } finally {
      setLoadingUsage(false);
    }
  };

  // Handle copy enum definition
  const handleCopyDefinition = () => {
    const definition = `CREATE TYPE ${enumType.schema}.${enumType.name} AS ENUM (${enumType.values.map(v => `'${v}'`).join(', ')});`;
    navigator.clipboard.writeText(definition);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Handle copy values
  const handleCopyValues = () => {
    const values = enumType.values.join(', ');
    navigator.clipboard.writeText(values);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Toggle expanded view
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <Card className={`w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 transition-all duration-300 overflow-hidden ${
      isExpanded ? 'fixed inset-4 z-50 overflow-auto' : 'relative'
    }`}>
      <CardHeader className="pb-2 border-b border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <List className="h-5 w-5 text-slate-700 dark:text-slate-300" />
            <CardTitle className="text-xl text-slate-800 dark:text-slate-200">
              {enumType.schema}.{enumType.name}
            </CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleExpanded}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center space-x-2 mt-1">
          <Badge className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800">
            <Database className="h-3 w-3" />
            {enumType.schema}
          </Badge>
          <Badge variant="outline" className="text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700">
            {enumType.values.length} values
          </Badge>
          {enumType.usage_count !== undefined && (
            <Badge 
              variant={enumType.usage_count > 0 ? "default" : "secondary"}
              className={enumType.usage_count > 0 
                ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800" 
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700"
              }
            >
              {enumType.usage_count} tables
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs 
          defaultValue="details" 
          value={activeTab} 
          onValueChange={setActiveTab} 
          className="w-full"
        >
          <TabsList className="w-full justify-start px-4 pt-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
            <TabsTrigger 
              value="details" 
              className="text-slate-600 dark:text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100"
            >
              Details
            </TabsTrigger>
            <TabsTrigger 
              value="values" 
              className="text-slate-600 dark:text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100"
            >
              Values
            </TabsTrigger>
            <TabsTrigger 
              value="usage" 
              className="text-slate-600 dark:text-slate-400 data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100"
            >
              Usage
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Enum Definition</h3>
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-md">
                  <code className="text-sm text-slate-800 dark:text-slate-200">
                    CREATE TYPE {enumType.schema}.{enumType.name} AS ENUM
                  </code>
                </div>
                
                <div className="flex items-center justify-between mt-3 mb-2">
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Values ({enumType.values.length})</h3>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleCopyValues}
                    className="text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-300 dark:border-slate-600"
                  >
                    {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-md max-h-48 overflow-y-auto">
                  <div className="flex flex-wrap gap-2">
                    {enumType.values.map((value, index) => (
                      <Badge 
                        key={index}
                        variant="secondary"
                        className="bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                      >
                        {value}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              
              <div>
                {enumType.description && (
                  <>
                    <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Description</h3>
                    <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-md text-slate-800 dark:text-slate-200 text-sm mb-4">
                      {enumType.description}
                    </div>
                  </>
                )}
                
                <div className="space-y-3">
                  {enumType.owner && (
                    <div className="flex items-center">
                      <User className="h-4 w-4 text-slate-500 dark:text-slate-400 mr-2" />
                      <span className="text-sm text-slate-600 dark:text-slate-400">Owner: </span>
                      <span className="text-sm text-slate-800 dark:text-slate-200 ml-1">{enumType.owner}</span>
                    </div>
                  )}
                  
                  {enumType.created && (
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 text-slate-500 dark:text-slate-400 mr-2" />
                      <span className="text-sm text-slate-600 dark:text-slate-400">Created: </span>
                      <span className="text-sm text-slate-800 dark:text-slate-200 ml-1">
                        {new Date(enumType.created).toLocaleString()}
                      </span>
                    </div>
                  )}
                  
                  {enumType.last_modified && (
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 text-slate-500 dark:text-slate-400 mr-2" />
                      <span className="text-sm text-slate-600 dark:text-slate-400">Last Modified: </span>
                      <span className="text-sm text-slate-800 dark:text-slate-200 ml-1">
                        {new Date(enumType.last_modified).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="values" className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">
                Enum Values ({enumType.values.length})
              </h3>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleCopyDefinition}
                className="text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-300 dark:border-slate-600"
              >
                {isCopied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Definition
                  </>
                )}
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {enumType.values.map((value, index) => (
                <div 
                  key={index}
                  className="bg-slate-50 dark:bg-slate-800 p-3 rounded-md border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <code className="text-sm text-slate-800 dark:text-slate-200 font-medium">
                      '{value}'
                    </code>
                    <Badge 
                      variant="outline" 
                      className="text-xs text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700"
                    >
                      {index + 1}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="usage" className="p-4">
            <div className="mb-4">
              <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">
                Database Usage
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Tables and columns that use this enum type
              </p>
            </div>
            
            {loadingUsage ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700 dark:border-slate-300"></div>
              </div>
            ) : enumUsage.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-slate-500 dark:text-slate-400">No usage found</div>
                <div className="mt-2 text-sm text-slate-400 dark:text-slate-500">
                  This enum is not currently used by any tables
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {enumUsage.map((usage, index) => (
                  <div 
                    key={index}
                    className="bg-slate-50 dark:bg-slate-800 p-4 rounded-md border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-1">
                          <Database className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                            {usage.schema}.{usage.table_name}
                          </span>
                        </div>
                        <Separator orientation="vertical" className="h-4" />
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          Column: <code className="text-slate-800 dark:text-slate-200">{usage.column_name}</code>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
      
      <CardFooter className="flex justify-between border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800">
        <Button 
          variant="default" 
          onClick={onEdit}
          className="bg-slate-700 hover:bg-slate-600 text-white dark:bg-slate-700 dark:hover:bg-slate-600"
        >
          <Edit className="h-4 w-4 mr-2" />
          Edit Enum
        </Button>
        <Button 
          variant="destructive" 
          onClick={onDelete}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Enum
        </Button>
      </CardFooter>
    </Card>
  );
} 