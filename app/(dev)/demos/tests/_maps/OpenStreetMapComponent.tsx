'use client';

import React, { useMemo, useEffect, useState, useRef } from "react";
import { LatLngExpression, Icon, Map as LeafletMap } from "leaflet";
import { useAppSelector } from "@/lib/redux/hooks";
import dynamic from "next/dynamic";

// Define the component props interface
interface OpenStreetMapProps {
  // Map basics
  initialPosition?: LatLngExpression;
  initialZoom?: number;
  height?: string | number;
  width?: string | number;
  className?: string;
  id?: string;
  
  // Layer configuration
  initialLayer?: 'standard' | 'satellite' | 'topo';
  enabledLayers?: {
    standard?: boolean;
    satellite?: boolean;
    topo?: boolean;
  };
  customLayers?: {
    [key: string]: {
      light: { url: string, attribution: string, name: string };
      dark: { url: string, attribution: string, name: string };
      icon?: string;
    }
  };

  // Controls configuration
  showLayerSwitcher?: boolean;
  showSearch?: boolean;
  showLocationMarker?: boolean;
  showScale?: boolean;
  showAttribution?: boolean;
  useImperialUnits?: boolean;
  
  // Control positions
  layerSwitcherPosition?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
  searchPosition?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
  scalePosition?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
  attributionPosition?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
  
  // Extra markers
  markers?: Array<{
    position: LatLngExpression;
    popupContent?: React.ReactNode;
    icon?: Icon;
  }>;
  
  // Custom event handlers
  onMapLoad?: (map: LeafletMap) => void;
  onLayerChange?: (layerType: string) => void;
}

// Import marker icon code separately to avoid SSR issues
const markerIconCode = () => {
  const L = require("leaflet");
  
  // Light icon
  const lightIcon = new L.Icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  // Dark icon
  const darkIcon = new L.Icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
  
  return { lightIcon, darkIcon };
};

// Dynamically load Leaflet components with SSR disabled
const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false }
);

const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false }
);

const Marker = dynamic(
  () => import("react-leaflet").then((mod) => mod.Marker),
  { ssr: false }
);

const Popup = dynamic(
  () => import("react-leaflet").then((mod) => mod.Popup),
  { ssr: false }
);

const AttributionControl = dynamic(
  () => import("react-leaflet").then((mod) => mod.AttributionControl),
  { ssr: false }
);

const ScaleControl = dynamic(
  () => import("react-leaflet").then((mod) => mod.ScaleControl),
  { ssr: false }
);

// Custom location control hook
const LocationMarker = dynamic(
  () => import("./components/LocationMarker").then((mod) => mod.default),
  { ssr: false }
);

// Custom search control
const SearchControl = dynamic(
  () => import("./components/SearchControl").then((mod) => mod.default),
  { ssr: false }
);

// Custom layer switcher with icon buttons
const LayerSwitcher = dynamic(
  () => import("./components/LayerSwitcher").then((mod) => mod.default),
  { ssr: false }
);

// Default map layers
const DEFAULT_LAYERS = {
  standard: {
    light: {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      name: "OpenStreetMap Standard",
      icon: "🗺️"
    },
    dark: {
      url: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
      attribution: '&copy; <a href="https://www.stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      name: "Stadia Dark",
      icon: "🗺️"
    }
  },
  satellite: {
    light: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
      name: "ESRI Satellite",
      icon: "🛰️"
    },
    dark: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
      name: "ESRI Satellite",
      icon: "🛰️"
    }
  },
  topo: {
    light: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
      name: "OpenTopoMap",
      icon: "⛰️"
    },
    dark: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
      name: "OpenTopoMap",
      icon: "⛰️"
    }
  }
};

// Default position (UCI - University of California, Irvine)
const DEFAULT_POSITION: LatLngExpression = [33.6592896, -117.866496];

function OpenStreetMapComponent({
  // Default values for all props
  initialPosition = DEFAULT_POSITION,
  initialZoom = 13,
  height = "600px",
  width = "100%",
  className = "",
  id,
  initialLayer = "standard",
  enabledLayers = { standard: true, satellite: true, topo: true },
  customLayers = {},
  showLayerSwitcher = true,
  showSearch = true,
  showLocationMarker = true,
  showScale = true,
  showAttribution = true,
  useImperialUnits = true,
  layerSwitcherPosition = "topright",
  searchPosition = "topright",
  scalePosition = "bottomleft",
  attributionPosition = "bottomright",
  markers = [],
  onMapLoad,
  onLayerChange
}: OpenStreetMapProps = {}) {
    const mapRef = useRef(null);
    const mode = useAppSelector((s) => s.theme.mode);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [icons, setIcons] = useState<{ lightIcon: any; darkIcon: any } | null>(null);
    const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
    const [activeLayer, setActiveLayer] = useState<string>(initialLayer);
    
    // Load leaflet CSS only on client-side
    useEffect(() => {
        require("leaflet/dist/leaflet.css");
        const { lightIcon, darkIcon } = markerIconCode();
        setIcons({ lightIcon, darkIcon });
        setMapLoaded(true);
    }, []);
    
    // Add new effect to handle map reference
    useEffect(() => {
        if (mapRef.current && !mapInstance) {
            setMapInstance(mapRef.current);
            if (onMapLoad && mapRef.current) {
                onMapLoad(mapRef.current);
            }
        }
    }, [mapRef.current, mapInstance, onMapLoad]);
    
    // Effect to handle changes to the initial position
    useEffect(() => {
        if (mapInstance && initialPosition) {
            mapInstance.setView(initialPosition, initialZoom, { animate: true });
        }
    }, [mapInstance, initialPosition, initialZoom]);
    
    // Effect to handle changes to the active layer
    useEffect(() => {
        if (mapInstance && initialLayer !== activeLayer) {
            setActiveLayer(initialLayer);
            // The LayerSwitcher component will handle the actual layer change
            // when it detects the activeLayer prop has changed
        }
    }, [mapInstance, initialLayer, activeLayer]);
    
    // Merge default layers with custom layers
    const allLayers = useMemo(() => {
        // Start with default layers
        const layers: any = {};
        
        // Only include enabled default layers
        if (enabledLayers.standard) layers.standard = DEFAULT_LAYERS.standard;
        if (enabledLayers.satellite) layers.satellite = DEFAULT_LAYERS.satellite;
        if (enabledLayers.topo) layers.topo = DEFAULT_LAYERS.topo;
        
        // Add custom layers
        return { ...layers, ...customLayers };
    }, [enabledLayers, customLayers]);
    
    // Select tile URL and marker icon based on theme
    const tileConfig = useMemo(() => {
        if (!icons) return null;
        
        // Add marker icon to the config
        return {
            ...allLayers,
            markerIcon: mode === "dark" ? icons.darkIcon : icons.lightIcon
        };
    }, [mode, icons, allLayers]);

    // Handle layer changes
    const handleLayerChange = (layerType: string) => {
        setActiveLayer(layerType);
        if (onLayerChange) {
            onLayerChange(layerType);
        }
    };

    if (!mapLoaded || !tileConfig) {
        return (
            <div 
                style={{ 
                    height: typeof height === 'number' ? `${height}px` : height, 
                    width: typeof width === 'number' ? `${width}px` : width
                }} 
                className={`bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse ${className}`}
            />
        );
    }

    return (
        <div 
            id={id}
            className={`map-container ${mode === "dark" ? "bg-gray-900" : "bg-white"} rounded-lg shadow-lg ${className}`}
            style={{ height: typeof height === 'number' ? `${height}px` : height }}
        >
            <MapContainer
                center={initialPosition}
                zoom={initialZoom}
                style={{ 
                    height: "100%", 
                    width: typeof width === 'number' ? `${width}px` : width
                }}
                className={mode === "dark" ? "leaflet-dark" : "leaflet-light"}
                attributionControl={false}
                scrollWheelZoom={true}
                ref={mapRef}
                whenReady={() => {
                    // Just for compatibility, no operation needed here
                }}
            >
                {showAttribution && (
                    <AttributionControl position={attributionPosition} prefix={false} />
                )}
                
                {showScale && (
                    <ScaleControl position={scalePosition} imperial={useImperialUnits} />
                )}
                
                {showLayerSwitcher && Object.keys(tileConfig).length > 1 && (
                    <LayerSwitcher 
                        layers={tileConfig} 
                        position={layerSwitcherPosition} 
                        initialLayer={activeLayer}
                        onLayerChange={handleLayerChange}
                    />
                )}
                
                {/* Main marker for the initial position */}
                <Marker 
                    key={`main-marker-${Array.isArray(initialPosition) ? initialPosition.join(',') : `${initialPosition.lat},${initialPosition.lng}`}`}
                    position={initialPosition} 
                    icon={tileConfig.markerIcon}
                >
                    <Popup>
                        <div className={mode === "dark" ? "dark-popup" : "light-popup"}>
                            Location: {Array.isArray(initialPosition) 
                                ? `${initialPosition[0]}, ${initialPosition[1]}` 
                                : `${initialPosition.lat}, ${initialPosition.lng}`}
                        </div>
                    </Popup>
                </Marker>
                
                {/* Additional markers */}
                {markers.map((marker, index) => (
                    <Marker 
                        key={`marker-${index}`} 
                        position={marker.position} 
                        icon={marker.icon || tileConfig.markerIcon}
                    >
                        {marker.popupContent && (
                            <Popup>
                                <div className={mode === "dark" ? "dark-popup" : "light-popup"}>
                                    {marker.popupContent}
                                </div>
                            </Popup>
                        )}
                    </Marker>
                ))}
                
                {/* Find my location component */}
                {showLocationMarker && (
                    <LocationMarker icon={tileConfig.markerIcon} />
                )}
                
                {/* Search location component */}
                {showSearch && (
                    <SearchControl position={searchPosition} />
                )}
            </MapContainer>
        </div>
    );
}

export default OpenStreetMapComponent;
