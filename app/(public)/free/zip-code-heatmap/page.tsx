"use client";

import { useState, useMemo } from "react";
import { MapPin, Upload, Info, Maximize2, Minimize2, Database, Share2, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ZipCodeMap from "./components/ZipCodeMap";
import FileUpload from "./components/FileUpload";
import ColorLegend from "./components/ColorLegend";
import ColorScaleSelector from "./components/ColorScaleSelector";
import ViewModeSelector from "./components/ViewModeSelector";
import TableDataSource from "./components/TableDataSource";
import SaveToTableModal from "./components/SaveToTableModal";
import SaveHeatmapModal from "./components/SaveHeatmapModal";
import type { ColorScaleOptions } from "./components/ColorScaleSelector";
import type { ViewMode } from "./components/ViewModeSelector";
import { aggregateByZip3 } from "./utils/dataAggregation";
import { toast } from "sonner";

export interface ZipCodeData {
    zipCode: string;
    count: number;
    displayLabel?: string; // For aggregated views
    originalId?: string; // For aggregated views (e.g., ZIP-3 prefix)
}

export default function ZipCodeHeatmapPage() {
    const [zipData, setZipData] = useState<ZipCodeData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>("zipCode");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [colorScaleOptions, setColorScaleOptions] = useState<ColorScaleOptions>({
        scalingMethod: "linear",
        colorScheme: "yellowRed",
    });
    const [dataSource, setDataSource] = useState<'upload' | 'table'>('upload');
    const [showSaveToTable, setShowSaveToTable] = useState(false);
    const [showSaveHeatmap, setShowSaveHeatmap] = useState(false);

    // Process data based on view mode
    const processedData = useMemo(() => {
        if (zipData.length === 0) return [];

        switch (viewMode) {
            case "zip3":
                const aggregated = aggregateByZip3(zipData);
                // Convert back to ZipCodeData format
                // Use representativeZip for geocoding, but keep id for display
                return aggregated.map((item) => ({
                    zipCode: item.representativeZip, // Use actual zip for geocoding
                    count: item.count,
                    displayLabel: item.label, // Store the display label
                    originalId: item.id, // Store the ZIP-3 prefix
                }));

            case "county":
                // County not yet implemented - use individual for now
                return zipData;

            case "zipCode":
            default:
                return zipData;
        }
    }, [zipData, viewMode]);

    const handleDataUpload = (data: ZipCodeData[]) => {
        setZipData(data);
    };

    const handleTableSaveSuccess = (tableId: string) => {
        toast.success('Data saved to table successfully!', {
            description: 'You can access it from the /data route.',
        });
    };

    const handleShareSaveSuccess = () => {
        // Toast is handled in the modal
    };

    const downloadSampleFile = (format: "csv" | "excel") => {
        const sampleData = `zipCode,count
92617,150
92618,230
92614,180
92612,95
92602,310
92603,145
92604,220
92606,175
92780,265
92782,190
90001,420
90002,380
90003,290
90004,510
90005,340`;

        if (format === "csv") {
            const blob = new Blob([sampleData], { type: "text/csv" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "sample-zip-codes.csv";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } else {
            // For Excel, we'll just download the CSV and let user know they can save as Excel
            // Or we could use xlsx library here as well
            const blob = new Blob([sampleData], { type: "text/csv" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "sample-zip-codes.csv";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }
    };

    const maxCount = processedData.length > 0 ? Math.max(...processedData.map((d) => d.count)) : 0;
    const minCount = processedData.length > 0 ? Math.min(...processedData.map((d) => d.count)) : 0;
    const totalRegions = processedData.length;

    return (
        <div className="h-full flex flex-col overflow-hidden bg-textured">
            {/* Main Content */}
            <div className="h-full overflow-hidden">
                <div className={`h-full overflow-hidden ${isFullscreen ? "" : "p-2 sm:p-3"}`}>
                    <div className={`h-full overflow-hidden ${isFullscreen ? "" : "max-w-[1920px] mx-auto"}`}>
                        <div
                            className={`grid h-full overflow-hidden ${isFullscreen ? "" : "gap-2 sm:gap-3"} ${
                                isFullscreen
                                    ? "grid-cols-1"
                                    : zipData.length > 0
                                    ? "grid-cols-1 xl:grid-cols-[320px_1fr]"
                                    : "grid-cols-1 lg:grid-cols-[380px_1fr]"
                            }`}
                        >
                            {/* Sidebar - Hidden in fullscreen */}
                            {!isFullscreen && (
                                <div className="space-y-3 flex flex-col h-full overflow-hidden">
                                    {/* Title Card */}
                                    <div className="flex-shrink-0 px-4 py-3 bg-background/50">
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center justify-center w-8 h-8 rounded-lg">
                                                <MapPin className="w-8 h-8 text-primary" />
                                            </div>
                                            <h1 className="text-lg font-bold">Zip Code Heatmap</h1>
                                        </div>
                                    </div>

                                    {/* Scrollable Content */}
                                    <div className="flex-1 overflow-y-auto space-y-3 px-1">
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-lg">Data Source</CardTitle>
                                            <CardDescription className="text-xs">
                                                Choose how to load your data
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <Tabs value={dataSource} onValueChange={(v) => setDataSource(v as 'upload' | 'table')}>
                                                <TabsList className="grid w-full grid-cols-2 mb-3">
                                                    <TabsTrigger value="upload" className="text-xs">
                                                        <Upload className="w-3 h-3 mr-1" />
                                                        Upload File
                                                    </TabsTrigger>
                                                    <TabsTrigger value="table" className="text-xs">
                                                        <Database className="w-3 h-3 mr-1" />
                                                        From Table
                                                    </TabsTrigger>
                                                </TabsList>
                                                <TabsContent value="upload" className="space-y-3 mt-0">
                                                    <FileUpload onDataUpload={handleDataUpload} onLoadingChange={setIsLoading} />
                                                    <button
                                                        onClick={() => downloadSampleFile("csv")}
                                                        className="w-full px-3 py-2 text-sm bg-muted hover:bg-muted/80 rounded-md transition-colors"
                                                    >
                                                        Download Sample CSV
                                                    </button>
                                                </TabsContent>
                                                <TabsContent value="table" className="mt-0">
                                                    <TableDataSource onDataLoad={handleDataUpload} onLoadingChange={setIsLoading} />
                                                </TabsContent>
                                            </Tabs>
                                        </CardContent>
                                    </Card>

                                    {zipData.length > 0 && (
                                        <>
                                            {/* Save Actions */}
                                            <Card>
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="text-lg">Save & Share</CardTitle>
                                                    <CardDescription className="text-xs">
                                                        Save your data or share this heatmap
                                                    </CardDescription>
                                                </CardHeader>
                                                <CardContent className="space-y-2">
                                                    <Button
                                                        variant="outline"
                                                        className="w-full justify-start"
                                                        size="sm"
                                                        onClick={() => setShowSaveToTable(true)}
                                                    >
                                                        <Database className="w-4 h-4 mr-2" />
                                                        Save to Table
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        className="w-full justify-start"
                                                        size="sm"
                                                        onClick={() => setShowSaveHeatmap(true)}
                                                    >
                                                        <Share2 className="w-4 h-4 mr-2" />
                                                        Save & Get Share Link
                                                    </Button>
                                                </CardContent>
                                            </Card>

                                            <Card>
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="text-lg">View Options</CardTitle>
                                                </CardHeader>
                                                <CardContent className="space-y-4">
                                                    <ViewModeSelector value={viewMode} onChange={setViewMode} />
                                                    <div className="border-t pt-4">
                                                        <ColorScaleSelector options={colorScaleOptions} onChange={setColorScaleOptions} />
                                                    </div>
                                                </CardContent>
                                            </Card>

                                            <Card>
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="text-lg">Legend</CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    <ColorLegend
                                                        minValue={minCount}
                                                        maxValue={maxCount}
                                                        scalingMethod={colorScaleOptions.scalingMethod}
                                                        colorScheme={colorScaleOptions.colorScheme}
                                                    />
                                                </CardContent>
                                            </Card>

                                            <Card>
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="text-lg">Statistics</CardTitle>
                                                </CardHeader>
                                                <CardContent className="space-y-2 text-sm">
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">
                                                            {viewMode === "zipCode" && "Total Zip Codes:"}
                                                            {viewMode === "zip3" && "Total ZIP-3 Regions:"}
                                                            {viewMode === "county" && "Total Counties:"}
                                                        </span>
                                                        <span className="font-semibold">{totalRegions}</span>
                                                    </div>
                                                    {viewMode !== "zipCode" && (
                                                        <div className="flex justify-between">
                                                            <span className="text-muted-foreground">Source Zip Codes:</span>
                                                            <span className="font-semibold">{zipData.length}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Max Count:</span>
                                                        <span className="font-semibold">{maxCount.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Min Count:</span>
                                                        <span className="font-semibold">{minCount.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Total Count:</span>
                                                        <span className="font-semibold">
                                                            {zipData.reduce((sum, d) => sum + d.count, 0).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </>
                                    )}
                                    </div>
                                </div>
                            )}

                            {/* Map */}
                            <div className={`relative ${isFullscreen ? "h-dvh" : "h-full"} overflow-hidden`}>
                                {/* Fullscreen Controls */}
                                {zipData.length > 0 && (
                                    <>
                                        {/* Toggle Button */}
                                        <button
                                            onClick={() => setIsFullscreen(!isFullscreen)}
                                            className="absolute top-4 right-4 z-[1000] p-2 bg-background/95 hover:bg-background border rounded-lg shadow-lg transition-all"
                                            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                                        >
                                            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                                        </button>

                                        {/* Floating Legend in Fullscreen */}
                                        {isFullscreen && (
                                            <div className="absolute bottom-6 left-6 z-[1000] bg-background/95 backdrop-blur-sm border rounded-lg shadow-xl p-4 max-w-xs">
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-sm font-semibold">Legend</h3>
                                                        <span className="text-xs text-muted-foreground">
                                                            {viewMode === "zipCode" ? "Zip Codes" : "ZIP-3 Regions"}
                                                        </span>
                                                    </div>
                                                    <ColorLegend
                                                        minValue={minCount}
                                                        maxValue={maxCount}
                                                        scalingMethod={colorScaleOptions.scalingMethod}
                                                        colorScheme={colorScaleOptions.colorScheme}
                                                    />
                                                    <div className="pt-2 border-t space-y-1 text-xs">
                                                        <div className="flex justify-between">
                                                            <span className="text-muted-foreground">Total:</span>
                                                            <span className="font-semibold">{totalRegions}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-muted-foreground">Sum:</span>
                                                            <span className="font-semibold">
                                                                {zipData.reduce((sum, d) => sum + d.count, 0).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}

                                <div className="h-full w-full overflow-hidden rounded-lg border bg-card shadow-sm">
                                    <ZipCodeMap
                                        data={processedData}
                                        isLoading={isLoading}
                                        scalingMethod={colorScaleOptions.scalingMethod}
                                        colorScheme={colorScaleOptions.colorScheme}
                                        viewMode={viewMode}
                                        isFullscreen={isFullscreen}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <SaveToTableModal
                isOpen={showSaveToTable}
                onClose={() => setShowSaveToTable(false)}
                data={zipData}
                onSuccess={handleTableSaveSuccess}
            />
            <SaveHeatmapModal
                isOpen={showSaveHeatmap}
                onClose={() => setShowSaveHeatmap(false)}
                data={zipData}
                viewSettings={{
                    viewMode,
                    colorScaleOptions,
                }}
            />
        </div>
    );
}
