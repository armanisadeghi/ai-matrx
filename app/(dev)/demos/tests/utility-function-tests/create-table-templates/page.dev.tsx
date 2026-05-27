'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { createTable, addRow, getTableDetails, type TableField } from '@/utils/user-table-utls/table-utils';
import { sampleData } from '@/utils/user-table-utls/sample-data';
import { getFlashcardSetOptions, getFlashcardSet } from '@/app/(transitional)/flashcard/app-data';
import { 
  getSchemaTemplates, 
  getSchemaTemplateById, 
  getTemplateOptions, 
  generateSanitizedTableName,
  type SchemaTemplate
} from '@/utils/user-table-utls/template-utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, Database, Plus, FileText, Eye } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import UserTableViewer from '@/components/user-generated-table-data/UserTableViewer';
import CreateTemplateModal from '@/components/user-generated-table-data/CreateTemplateModal';

export default function UtilityTestPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
    tableId?: string;
  }>({ status: 'idle', message: '' });
  
  const [isAddingData, setIsAddingData] = useState(false);
  const [addDataResult, setAddDataResult] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
    rowCount: number;
  }>({ status: 'idle', message: '', rowCount: 0 });

  // Schema templates state
  const [schemaTemplates, setSchemaTemplates] = useState<SchemaTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<SchemaTemplate | null>(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  
  // User provided name
  const [userTableName, setUserTableName] = useState<string>('My Flashcards');
  
  // Flashcard data state
  const [flashcardSetOptions, setFlashcardSetOptions] = useState<{
    value: string;
    label: string;
  }[]>([]);
  const [selectedFlashcardSet, setSelectedFlashcardSet] = useState<string>('');
  const [maxEntries, setMaxEntries] = useState<number>(10);
  const [includeDataWithTable, setIncludeDataWithTable] = useState<boolean>(false);
  const [flashcardData, setFlashcardData] = useState<any[]>([]);
  const [isLoadingFlashcards, setIsLoadingFlashcards] = useState<boolean>(false);
  
  // View table modal state
  const [viewTableModalOpen, setViewTableModalOpen] = useState(false);
  
  // Add template modal state
  const [createTemplateModalOpen, setCreateTemplateModalOpen] = useState(false);

  // Load schema templates when component mounts
  useEffect(() => {
    loadTemplates();
  }, []);
  
  // Function to load templates (extracted to its own function for reuse)
  const loadTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const templates = await getSchemaTemplates(supabase);
      setSchemaTemplates(templates);
      
      if (templates.length > 0) {
        setSelectedTemplateId(templates[0].id);
        setSelectedTemplate(templates[0]);
      }
    } catch (error) {
      console.error('Error loading schema templates:', error);
    } finally {
      setIsLoadingTemplates(false);
    }
  };
  
  // Handle successful template creation
  const handleTemplateCreationSuccess = (templateId: string) => {
    // Refresh the templates list
    loadTemplates();
    
    // Select the newly created template
    setSelectedTemplateId(templateId);
  };

  // Load selected template details
  useEffect(() => {
    if (!selectedTemplateId) return;
    
    const loadTemplate = async () => {
      try {
        const template = await getSchemaTemplateById(supabase, selectedTemplateId);
        setSelectedTemplate(template);
        
        // Update table name suggestion based on template
        if (template) {
          setUserTableName(`My ${template.template_name}`);
        }
      } catch (error) {
        console.error('Error loading template details:', error);
      }
    };
    
    loadTemplate();
  }, [selectedTemplateId]);

  // Load flashcard set options when component mounts
  useEffect(() => {
    const loadOptions = async () => {
      const options = await getFlashcardSetOptions();
      setFlashcardSetOptions(options);
      if (options.length > 0) {
        setSelectedFlashcardSet(options[0].value);
      }
    };
    
    loadOptions();
  }, []);

  // Load flashcard data when set changes
  useEffect(() => {
    if (!selectedFlashcardSet) return;
    
    const loadFlashcardData = async () => {
      setIsLoadingFlashcards(true);
      try {
        const data = await getFlashcardSet(selectedFlashcardSet);
        setFlashcardData(data);
      } catch (error) {
        console.error('Error loading flashcard data:', error);
      } finally {
        setIsLoadingFlashcards(false);
      }
    };
    
    loadFlashcardData();
  }, [selectedFlashcardSet]);

  const handleCreateTable = async () => {
    if (!selectedTemplate) {
      setResult({
        status: 'error',
        message: 'No template selected',
      });
      return;
    }
    
    if (!userTableName.trim()) {
      setResult({
        status: 'error',
        message: 'Please provide a table name',
      });
      return;
    }
    
    setIsLoading(true);
    setResult({ status: 'idle', message: '' });
    setAddDataResult({ status: 'idle', message: '', rowCount: 0 });

    try {
      // Generate a sanitized, unique table name
      const sanitizedTableName = generateSanitizedTableName(userTableName);
      
      // Create table structure using the selected template
      const result = await createTable(supabase, {
        tableName: sanitizedTableName,
        description: `${userTableName} - Created from ${selectedTemplate.template_name} template`,
        isPublic: false,
        authenticatedRead: true,
        fields: selectedTemplate.fields,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to create table');
      }

      setResult({
        status: 'success',
        message: `Table '${userTableName}' created successfully!`,
        tableId: result.tableId,
      });
      
      // If including data with table creation, add the data immediately
      if (includeDataWithTable && flashcardData.length > 0 && result.tableId) {
        await addFlashcardData(result.tableId);
      }
    } catch (error) {
      console.error('Error creating table:', error);
      setResult({
        status: 'error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Add flashcard data to an existing table
  const addFlashcardData = async (tableId: string) => {
    if (!tableId) {
      setAddDataResult({
        status: 'error',
        message: 'No table has been created yet',
        rowCount: 0
      });
      return;
    }
    
    setIsAddingData(true);
    setAddDataResult({ status: 'idle', message: '', rowCount: 0 });
    
    try {
      // Get the table details to understand its structure
      const tableDetails = await getTableDetails(supabase, tableId);
      
      if (!tableDetails.success || !tableDetails.fields) {
        throw new Error(tableDetails.error || 'Failed to get table structure');
      }
      
      // Limit the number of entries to add
      const dataToAdd = flashcardData.slice(0, maxEntries);
      
      // Map flashcard data to table structure
      const mappedData = dataToAdd.map((card, index) => {
        // Create a standardized row structure
        const rowData: Record<string, any> = {
          order: index + 1,
          topic: card.topic || card.category || 'General',
          lesson: card.lesson || card.chapter || '',
          gradeLevel: card.gradeLevel || card.level || 0,
          front: card.question || card.term || card.front || 'No question provided',
          back: card.answer || card.definition || card.back || 'No answer provided',
          example: card.example || '',
          detailedExplanation: card.explanation || card.detailedExplanation || '',
          audioExplanation: card.audio || '',
          relatedImages: card.images || [],
          personalNotes: '',
          isDeleted: false,
          dynamicContent: {},
          tags: card.tags || []
        };
        
        return rowData;
      });
      
      // Add each row
      let successCount = 0;
      for (const rowData of mappedData) {
        const rowResult = await addRow(supabase, {
          tableId,
          data: rowData
        });
        
        if (rowResult.success) {
          successCount++;
        }
      }
      
      setAddDataResult({
        status: 'success',
        message: `Added ${successCount} of ${dataToAdd.length} flashcard entries`,
        rowCount: successCount
      });
    } catch (error) {
      console.error('Error adding flashcard data:', error);
      setAddDataResult({
        status: 'error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        rowCount: 0
      });
    } finally {
      setIsAddingData(false);
    }
  };

  // Original add sample data function, modified for flashcards
  const handleAddSampleData = async () => {
    if (flashcardData.length === 0) {
      setAddDataResult({
        status: 'error',
        message: 'No flashcard data loaded',
        rowCount: 0
      });
      return;
    }
    
    if (!result.tableId) {
      setAddDataResult({
        status: 'error',
        message: 'No table has been created yet',
        rowCount: 0
      });
      return;
    }
    
    addFlashcardData(result.tableId);
  };
  
  // Open the view table modal
  const handleViewTable = () => {
    if (result.tableId) {
      setViewTableModalOpen(true);
    }
  };

  return (
    <div className="container py-10">
      <h1 className="text-2xl font-bold mb-6">Template-Based Table Creation</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Table Configuration</CardTitle>
          <CardDescription>
            Select a schema template and configure your table
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="template-select">Schema Template</Label>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCreateTemplateModalOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Create New Template
              </Button>
            </div>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
              disabled={isLoadingTemplates || schemaTemplates.length === 0}
            >
              <SelectTrigger id="template-select" className="w-full">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {schemaTemplates.map(template => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.template_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLoadingTemplates && <p className="text-sm text-muted-foreground">Loading templates...</p>}
            {selectedTemplate && (
              <p className="text-sm text-muted-foreground mt-1">
                {selectedTemplate.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="table-name">Table Name</Label>
            <Input
              id="table-name"
              value={userTableName}
              onChange={(e) => setUserTableName(e.target.value)}
              placeholder="Enter a name for your table"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Provide a human-readable name for your table
            </p>
          </div>

          {selectedTemplate && selectedTemplate.template_name.toLowerCase().includes('flashcard') && (
            <>
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium mb-2">Data Import Options</h3>
              </div>
            
              <div className="space-y-2">
                <Label htmlFor="flashcard-set">Flashcard Set</Label>
                <Select
                  value={selectedFlashcardSet}
                  onValueChange={setSelectedFlashcardSet}
                  disabled={isLoadingFlashcards || flashcardSetOptions.length === 0}
                >
                  <SelectTrigger id="flashcard-set" className="w-full">
                    <SelectValue placeholder="Select a flashcard set" />
                  </SelectTrigger>
                  <SelectContent>
                    {flashcardSetOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isLoadingFlashcards && <p className="text-sm text-muted-foreground">Loading flashcards...</p>}
                {!isLoadingFlashcards && flashcardData.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {flashcardData.length} flashcards available in this set
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-entries">Maximum Entries to Import</Label>
                <Input
                  id="max-entries"
                  type="number"
                  min="1"
                  max={flashcardData.length || 100}
                  value={maxEntries}
                  onChange={(e) => setMaxEntries(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <Switch
                  id="include-data"
                  checked={includeDataWithTable}
                  onCheckedChange={setIncludeDataWithTable}
                />
                <Label htmlFor="include-data">Include data when creating table</Label>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="create-table" className="mb-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="create-table">Create Table</TabsTrigger>
          <TabsTrigger value="add-data" disabled={!result.tableId}>Add Data</TabsTrigger>
        </TabsList>
        
        <TabsContent value="create-table">
          <Card>
            <CardHeader>
              <CardTitle>Create Table from Template</CardTitle>
              <CardDescription>
                Create a new table using the selected schema template
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="mb-4">
                <h3 className="text-sm font-medium mb-2">Configuration Summary</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li><strong>Table Name:</strong> {userTableName}</li>
                  <li><strong>Template:</strong> {selectedTemplate?.template_name || 'None selected'}</li>
                  {selectedTemplate && (
                    <li><strong>Fields:</strong> {selectedTemplate.fields.length}</li>
                  )}
                  {selectedTemplate?.template_name.toLowerCase().includes('flashcard') && (
                    <>
                      <li><strong>Data Source:</strong> {selectedFlashcardSet || 'None selected'}</li>
                      <li><strong>Max Entries:</strong> {maxEntries}</li>
                      <li><strong>Include Data:</strong> {includeDataWithTable ? 'Yes' : 'No'}</li>
                    </>
                  )}
                </ul>
              </div>
              
              {result.status !== 'idle' && (
                <Alert 
                  className={`mb-4 ${
                    result.status === 'success' 
                      ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300' 
                      : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300'
                  }`}
                >
                  {result.status === 'success' ? (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  ) : (
                    <AlertCircle className="h-4 w-4 mr-2" />
                  )}
                  <AlertTitle>{result.status === 'success' ? 'Success!' : 'Error!'}</AlertTitle>
                  <AlertDescription>
                    {result.message}
                    {result.tableId && (
                      <div className="mt-2">
                        <strong>Table ID:</strong> {result.tableId}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>

            <CardFooter className="flex flex-col sm:flex-row gap-2">
              <Button 
                onClick={handleCreateTable} 
                disabled={isLoading || !selectedTemplate || !userTableName.trim()}
                className="w-full"
              >
                <Database className="h-4 w-4 mr-2" />
                {isLoading ? 'Creating...' : 'Create Table'}
              </Button>
              
              {result.tableId && (
                <Button
                  onClick={handleViewTable}
                  variant="outline"
                  className="w-full"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Table
                </Button>
              )}
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="add-data">
          <Card>
            <CardHeader>
              <CardTitle>Add Data to Table</CardTitle>
              <CardDescription>
                Import data to the created table
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="mb-4">
                <h3 className="text-sm font-medium mb-2">Table Information</h3>
                <p className="text-sm mb-2"><strong>Name:</strong> {userTableName}</p>
                <p className="text-sm mb-2"><strong>ID:</strong></p>
                <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-sm overflow-x-auto">
                  {result.tableId}
                </code>
              </div>
              
              {addDataResult.status !== 'idle' && (
                <Alert 
                  className={`mb-4 ${
                    addDataResult.status === 'success' 
                      ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300' 
                      : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300'
                  }`}
                >
                  {addDataResult.status === 'success' ? (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  ) : (
                    <AlertCircle className="h-4 w-4 mr-2" />
                  )}
                  <AlertTitle>{addDataResult.status === 'success' ? 'Success!' : 'Error!'}</AlertTitle>
                  <AlertDescription>
                    {addDataResult.message}
                    {addDataResult.status === 'success' && (
                      <div className="mt-2">
                        <strong>Rows Added:</strong> {addDataResult.rowCount}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>

            <CardFooter className="flex flex-col sm:flex-row gap-2">
              <Button 
                onClick={handleAddSampleData} 
                disabled={isAddingData || !result.tableId || flashcardData.length === 0}
                className="w-full"
              >
                <FileText className="h-4 w-4 mr-2" />
                {isAddingData ? 'Adding Data...' : `Add ${Math.min(maxEntries, flashcardData.length)} Rows`}
              </Button>
              
              {result.tableId && (
                <Button
                  onClick={handleViewTable}
                  variant="outline"
                  className="w-full"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Table
                </Button>
              )}
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Table Viewer Dialog */}
      <Dialog open={viewTableModalOpen} onOpenChange={setViewTableModalOpen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Table Viewer - {userTableName}</DialogTitle>
            <DialogDescription>
              Viewing data for the created table
            </DialogDescription>
          </DialogHeader>
          
          {result.tableId && (
            <div className="mt-4">
              <UserTableViewer tableId={result.tableId} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Template Modal */}
      <CreateTemplateModal 
        isOpen={createTemplateModalOpen}
        onClose={() => setCreateTemplateModalOpen(false)}
        onSuccess={handleTemplateCreationSuccess}
      />

      <Card>
        <CardHeader>
          <CardTitle>Template-Based Design</CardTitle>
          <CardDescription>
            Create tables from predefined schema templates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600 dark:text-gray-400">
            <li>Select from database-stored schema templates</li>
            <li>Provide user-friendly table names</li>
            <li>System ensures unique database table names</li>
            <li>Automatically adapt data import based on template type</li>
            <li>Import data during table creation or afterward</li>
            <li>View and verify table data in a modal dialog</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}