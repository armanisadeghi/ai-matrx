'use client';

import React, { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { 
  selectContainerById, 
  selectContainerLoading,
  selectFieldsForContainer
} from '@/lib/redux/app-builder/selectors/containerSelectors';
import { 
  setActiveContainer 
} from '@/lib/redux/app-builder/slices/containerBuilderSlice';
import { 
  fetchContainerByIdThunk,
  setActiveContainerWithFetchThunk
} from '@/lib/redux/app-builder/thunks/containerBuilderThunks';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Pencil, Box, Tag, AlertTriangle, Check, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';

export default function ContainerViewPage({ params }: { params: Promise<{ id: string }> }) {
  // Use React.use() to unwrap the params Promise
  const resolvedParams = React.use(params);
  const { id } = resolvedParams;
  
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { toast } = useToast();
  
  // Get container data from Redux
  const container = useAppSelector((state) => selectContainerById(state, id));
  const isLoading = useAppSelector(selectContainerLoading);
  const containerFields = useAppSelector((state) => selectFieldsForContainer(state, id));
  
  // Load container data when the component mounts
  useEffect(() => {
    const loadContainer = async () => {
      try {
        if (!container) {
          await dispatch(fetchContainerByIdThunk(id)).unwrap();
        }
        dispatch(setActiveContainerWithFetchThunk(id));
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load container',
          variant: 'destructive',
        });
        router.push('/apps/app-builder/containers');
      }
    };
    
    loadContainer();
    
    return () => {
      // Clear active container when unmounting
      dispatch(setActiveContainer(null));
    };
  }, [id, dispatch, container, router, toast]);
  
  // Handle edit button click
  const handleEdit = () => {
    router.push(`/apps/app-builder/containers/${id}/edit`);
  };
  
  if (isLoading || !container) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <div className="space-y-8">
      {/* Container metadata */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="mb-2">Container Overview</CardTitle>
              <CardDescription>Basic information about this container</CardDescription>
            </div>
            <Button onClick={handleEdit} size="sm">
              <Pencil className="h-4 w-4 mr-2" />
              Edit Container
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</p>
              <p className="text-lg">{container.label}</p>
            </div>
            
            {container.shortLabel && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Short Label</p>
                <p className="text-lg">{container.shortLabel}</p>
              </div>
            )}
            
            <div className="space-y-2 col-span-1 md:col-span-2">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</p>
              <p className="text-md">{container.description || 'No description provided'}</p>
              
              {container.hideDescription && (
                <div className="flex items-center text-amber-500 dark:text-amber-400 mt-1 text-sm">
                  <Info className="h-4 w-4" />
                  <span>Description is hidden from users</span>
                </div>
              )}
            </div>
            
            {container.helpText && (
              <div className="space-y-2 col-span-1 md:col-span-2">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Help Text</p>
                <p className="text-md">{container.helpText}</p>
              </div>
            )}
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</p>
            <div className="flex flex-wrap gap-2">
              {container.isPublic ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 py-1">
                  <Check className="h-3.5 w-3.5" />
                  Public
                </Badge>
              ) : (
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 py-1">
                  <Tag className="h-3.5 w-3.5" />
                  Private
                </Badge>
              )}
              
              {container.authenticatedRead && (
                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 py-1">
                  <Check className="h-3.5 w-3.5" />
                  Authenticated Read
                </Badge>
              )}
              
              {container.publicRead && (
                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 py-1">
                  <Check className="h-3.5 w-3.5" />
                  Public Read
                </Badge>
              )}
              
              {container.isLocal && (
                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 py-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Local Only
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Fields section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Box className="h-5 w-5 mr-2" />
            Container Fields
          </CardTitle>
          <CardDescription>
            Fields included in this container
          </CardDescription>
        </CardHeader>
        <CardContent>
          {containerFields.length === 0 ? (
            <div className="py-8 flex flex-col items-center justify-center text-center">
              <Box className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Fields Added</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-md">
                This container doesn't have any fields yet. Edit the container to add fields.
              </p>
              <Button onClick={handleEdit}>
                Add Fields
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                  <TableHead className="text-right">Required</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {containerFields.map((field) => (
                  <TableRow key={field.id}>
                    <TableCell className="font-medium">{field.label}</TableCell>
                    <TableCell>{field.component}</TableCell>
                    <TableCell className="hidden md:table-cell line-clamp-1">
                      {field.description || 'No description'}
                    </TableCell>
                    <TableCell className="text-right">
                      {field.required ? (
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                          Required
                        </Badge>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">Optional</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 