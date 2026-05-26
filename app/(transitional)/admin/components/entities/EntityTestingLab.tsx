// app/admin/components/entity-testing/EntityTestingLab.tsx
'use client';

import {useState, useEffect} from 'react';
import {motion} from 'motion/react';
import {useEntity} from '@/lib/redux/entity/hooks/useEntity';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {Badge} from "@/components/ui/badge";
import {Loader2} from "lucide-react";
import LogViewer from './LogViewer';
import {EntityKeys} from '@/types/entityTypes';
import { useToast } from "@/components/ui/matrx/use-toast";
import {useEntityLogging} from "@/app/(transitional)/admin/components/entities/useEntityLogging";
import PreWiredEntitySelectName from './PreWiredEntitySelectName';
import BrowseTab from './tabs/BrowseTab';
import OperationsTab from './tabs/OperationsTab';
import FiltersTab from './tabs/FiltersTab';
import MetricsTab from './tabs/MetricsTab';
import DebugTab from './tabs/DebugTab';


const EntityTestingLab = () => {
    const [selectedEntity, setSelectedEntity] = useState<EntityKeys>('registeredFunction');

    const [currentTab, setCurrentTab] = useState('browse');
    const entity = useEntity(selectedEntity);
    const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
    const [filterValue, setFilterValue] = useState('');
    const [sortField, setSortField] = useState('');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const {toast} = useToast();

    // Use the custom logging hook
    const {errorLog, logError, clearErrorLog} = useEntityLogging(entity);

    useEffect(() => {
        try {
            console.log('Attempting to fetch records...');
            if (entity.entityMetadata) {
                console.log('Metadata available, fetching records');
                entity.fetchRecords(1, 10);
            } else {
                console.log('No metadata available yet');
            }
        } catch (error) {
            console.error('Error initializing entity:', error);
            logError(error);
        }
    }, [selectedEntity, entity.entityMetadata, logError]);


    useEffect(() => {
        try {
            if (entity.entityMetadata) {
                entity.fetchRecords(1, 10);
            }
        } catch (error) {
            console.error('Error initializing entity:', error);
            logError(error);
        }
    }, [selectedEntity, entity.entityMetadata]);

    if (!entity.entityMetadata) {
        return (
            <div className="flex items-center justify-center h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin"/>
                <span className="ml-2">Loading entity metadata...</span>
            </div>
        );
    }

    // Handle record selection
    const handleRecordSelect = (recordId: string) => {
        setSelectedRecords(prev =>
            prev.includes(recordId)
            ? prev.filter(id => id !== recordId)
            : [...prev, recordId]
        );
    };

    // Animation variants
    const containerVariants = {
        hidden: {opacity: 0, y: 20},
        visible: {
            opacity: 1,
            y: 0,
            transition: {staggerChildren: 0.1}
        }
    };

    const itemVariants = {
        hidden: {opacity: 0, x: -20},
        visible: {opacity: 1, x: 0}
    };

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="w-full h-full"
        >
            <Card>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        <span>Entity Testing Laboratory</span>
                        <PreWiredEntitySelectName
                            selectedEntity={selectedEntity}
                            onValueChange={setSelectedEntity}
                        />
                    </CardTitle>
                    <CardDescription>
                        Test and monitor entity operations in real-time
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <Tabs value={currentTab} onValueChange={setCurrentTab}>
                        <TabsList className="grid w-full grid-cols-6">
                            <TabsTrigger value="browse">Browse</TabsTrigger>
                            <TabsTrigger value="operations">Operations</TabsTrigger>
                            <TabsTrigger value="filters">Filters & Sort</TabsTrigger>
                            <TabsTrigger value="metrics">Metrics</TabsTrigger>
                            <TabsTrigger value="logs">Logs</TabsTrigger>
                            <TabsTrigger value="debug">Debug</TabsTrigger>
                        </TabsList>

                        <TabsContent value="browse">
                            <BrowseTab entity={entity} handleRecordSelect={handleRecordSelect}
                                       selectedRecords={selectedRecords}/>
                        </TabsContent>
                        <TabsContent value="operations">
                            <OperationsTab/>
                        </TabsContent>
                        <TabsContent value="filters">
                            <FiltersTab
                                entity={entity}
                                filterValue={filterValue}
                                setFilterValue={setFilterValue}
                                sortField={sortField}
                                setSortField={setSortField}
                                sortDirection={sortDirection}
                                setSortDirection={setSortDirection}
                            />
                        </TabsContent>
                        <TabsContent value="metrics">
                            <MetricsTab entity={entity} errorLog={errorLog} clearErrorLog={clearErrorLog}/>
                        </TabsContent>
                        <TabsContent value="logs">
                            <LogViewer/>
                        </TabsContent>
                        <TabsContent value="debug">
                            <DebugTab entity={entity}/>
                        </TabsContent>

                    </Tabs>
                </CardContent>

                <CardFooter className="bg-muted/50 p-4">
                    <div className="w-full flex justify-between items-center">
                        <div className="flex items-center space-x-2">
                            <Badge variant={entity.loadingState.loading ? "secondary" : "default"}>
                                {entity.loadingState.loading ? "Loading..." : "Ready"}
                            </Badge>
                            {entity.error && (
                                <Badge variant="destructive">
                                    Error: {entity.error.message}
                                </Badge>
                            )}
                        </div>
                        <span className="text-sm text-muted-foreground">
                            Total Records: {entity.paginationInfo.totalCount}
                        </span>
                    </div>
                </CardFooter>
            </Card>
        </motion.div>
    );
};

export default EntityTestingLab;
