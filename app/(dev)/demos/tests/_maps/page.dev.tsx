"use client";

import { useState } from "react";
import OpenStreetMapComponent from "./OpenStreetMapComponent";
import { LatLngExpression } from "leaflet";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LOCATIONS, CUSTOM_LAYERS } from "./constants";

export default function MapsPage() {
    // Map config state
    const [selectedLocation, setSelectedLocation] = useState<keyof typeof LOCATIONS>("Irvine, CA");
    const [zoom, setZoom] = useState(13);
    const [height, setHeight] = useState(600);
    const [initialLayer, setInitialLayer] = useState<"standard" | "satellite" | "topo">("standard");
    const [currentLayer, setCurrentLayer] = useState<string>("standard");

    // Features state
    const [showLayerSwitcher, setShowLayerSwitcher] = useState(true);
    const [showSearch, setShowSearch] = useState(true);
    const [showLocationMarker, setShowLocationMarker] = useState(true);
    const [showScale, setShowScale] = useState(true);
    const [useImperialUnits, setUseImperialUnits] = useState(true);

    // Layer config state
    const [enableStandard, setEnableStandard] = useState(true);
    const [enableSatellite, setEnableSatellite] = useState(true);
    const [enableTopo, setEnableTopo] = useState(true);
    const [enableWatercolor, setEnableWatercolor] = useState(false);
    const [enableTerrain, setEnableTerrain] = useState(false);

    // Additional markers
    const [showExtraMarkers, setShowExtraMarkers] = useState(false);

    // Current config based on state
    const currentPosition = LOCATIONS[selectedLocation] as LatLngExpression;

    // Prepare enabled layers
    const enabledLayers = {
        standard: enableStandard,
        satellite: enableSatellite,
        topo: enableTopo,
    };

    // Prepare custom layers
    const customLayers: any = {};
    if (enableWatercolor) customLayers.watercolor = CUSTOM_LAYERS.watercolor;
    if (enableTerrain) customLayers.terrain = CUSTOM_LAYERS.terrain;

    // Ensure height is a string with 'px' suffix
    const mapHeight = `${height}px`;

    // Prepare extra markers
    const markers = showExtraMarkers
        ? [
              {
                  position: [34.0522, -118.2437] as LatLngExpression, // Los Angeles
                  popupContent: <div className="font-bold">Los Angeles</div>,
              },
              {
                  position: [37.7749, -122.4194] as LatLngExpression, // San Francisco
                  popupContent: <div className="font-bold">San Francisco</div>,
              },
          ]
        : [];

    // Log events
    const handleMapLoad = (map: any) => {
        console.log("Map loaded:", map);
    };

    const handleLayerChange = (layer: string) => {
        console.log("Layer changed to:", layer);
        setCurrentLayer(layer);
    };

    return (
        <div className="space-y-6 p-4">
            <h1 className="text-2xl font-bold mb-4">Matrx Maps</h1>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Map display */}
                <div 
                    className="lg:col-span-3"
                    style={{ height: `${height}px` }}
                >
                    <OpenStreetMapComponent
                        initialPosition={currentPosition}
                        initialZoom={zoom}
                        height="100%"
                        initialLayer={initialLayer}
                        showLayerSwitcher={showLayerSwitcher}
                        showSearch={showSearch}
                        showLocationMarker={showLocationMarker}
                        showScale={showScale}
                        useImperialUnits={useImperialUnits}
                        enabledLayers={enabledLayers}
                        customLayers={customLayers}
                        markers={markers}
                        onMapLoad={handleMapLoad}
                        onLayerChange={handleLayerChange}
                        className="rounded-lg shadow-lg h-full"
                    />
                </div>

                {/* Controls sidebar */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-textured rounded-lg shadow-md p-4">
                        <h2 className="text-lg font-semibold mb-3">Map Configuration</h2>

                        <div className="space-y-3">
                            {/* Location */}
                            <div>
                                <Label className="mb-1">Location</Label>
                                <Select value={selectedLocation} onValueChange={(value) => setSelectedLocation(value as keyof typeof LOCATIONS)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select location" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.keys(LOCATIONS).map((location) => (
                                            <SelectItem key={location} value={location}>
                                                {location}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Zoom */}
                            <div>
                                <Label className="mb-1">Zoom Level: {zoom}</Label>
                                <Slider 
                                    min={1} 
                                    max={18} 
                                    step={1}
                                    value={[zoom]} 
                                    onValueChange={(value) => setZoom(value[0])} 
                                />
                            </div>

                            {/* Height */}
                            <div>
                                <Label className="mb-1">Height: {height}px</Label>
                                <Slider 
                                    min={150} 
                                    max={1000} 
                                    step={50} 
                                    value={[height]} 
                                    onValueChange={(value) => setHeight(value[0])} 
                                />
                            </div>

                            {/* Initial Layer */}
                            <div>
                                <Label className="mb-1">Initial Layer (Current: <span className="font-medium">{currentLayer}</span>)</Label>
                                <Select value={initialLayer} onValueChange={(value) => setInitialLayer(value as "standard" | "satellite" | "topo")}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {enableStandard && <SelectItem value="standard">Standard</SelectItem>}
                                        {enableSatellite && <SelectItem value="satellite">Satellite</SelectItem>}
                                        {enableTopo && <SelectItem value="topo">Topographic</SelectItem>}
                                    </SelectContent>
                                </Select>
                                <div className="mt-2">
                                    <button 
                                        className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm" 
                                        onClick={() => setInitialLayer(currentLayer as "standard" | "satellite" | "topo")}
                                    >
                                        Apply Current Layer
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-textured rounded-lg shadow-md p-4">
                        <h2 className="text-lg font-semibold mb-3">Features</h2>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Layer Switcher</Label>
                                <Switch 
                                    checked={showLayerSwitcher} 
                                    onCheckedChange={setShowLayerSwitcher}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <Label>Search</Label>
                                <Switch 
                                    checked={showSearch} 
                                    onCheckedChange={setShowSearch}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <Label>Location Marker</Label>
                                <Switch 
                                    checked={showLocationMarker} 
                                    onCheckedChange={setShowLocationMarker}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <Label>Scale</Label>
                                <Switch 
                                    checked={showScale} 
                                    onCheckedChange={setShowScale}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <Label>Use Imperial Units</Label>
                                <Switch 
                                    checked={useImperialUnits} 
                                    onCheckedChange={setUseImperialUnits}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <Label>Show Example Markers</Label>
                                <Switch 
                                    checked={showExtraMarkers} 
                                    onCheckedChange={setShowExtraMarkers}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-textured rounded-lg shadow-md p-4">
                        <h2 className="text-lg font-semibold mb-3">Layers</h2>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Standard Map</Label>
                                <Switch 
                                    checked={enableStandard} 
                                    onCheckedChange={setEnableStandard}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <Label>Satellite</Label>
                                <Switch 
                                    checked={enableSatellite} 
                                    onCheckedChange={setEnableSatellite}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <Label>Topographic</Label>
                                <Switch 
                                    checked={enableTopo} 
                                    onCheckedChange={setEnableTopo}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <Label>Watercolor (Custom)</Label>
                                <Switch 
                                    checked={enableWatercolor} 
                                    onCheckedChange={setEnableWatercolor}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <Label>Terrain (Custom)</Label>
                                <Switch 
                                    checked={enableTerrain} 
                                    onCheckedChange={setEnableTerrain}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
