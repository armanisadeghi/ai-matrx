'use client';

import { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useAppSelector } from '@/lib/redux/hooks';

interface LayerConfigType {
  url: string;
  attribution: string;
  name: string;
  icon?: string;
}

interface LayerSwitcherProps {
  position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
  layers: Record<string, any>;
  initialLayer?: string;
  onLayerChange?: (layerType: string) => void;
}

export default function LayerSwitcher({ 
  position = 'topright',
  layers,
  initialLayer = 'standard',
  onLayerChange
}: LayerSwitcherProps) {
  const map = useMap();
  const mode = useAppSelector((s) => s.theme.mode);
  const [activeLayer, setActiveLayer] = useState(initialLayer);
  const layerControlRef = useRef<any>(null);
  const layersRef = useRef<Record<string, L.TileLayer>>({});
  
  // Effect to handle when parent component changes the initialLayer
  useEffect(() => {
    if (activeLayer !== initialLayer && layersRef.current[initialLayer]) {
      // Remove all current layers
      Object.values(layersRef.current).forEach(layer => {
        if (map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
      });
      
      // Add the new layer
      layersRef.current[initialLayer].addTo(map);
      
      // Update active layer
      setActiveLayer(initialLayer);
    }
  }, [initialLayer, activeLayer, map]);
  
  // Initialize and handle layer switching
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Available layer instances
    const availableLayers: Record<string, L.TileLayer> = {};
    
    // Create and add tile layers to the map (but don't add to map yet)
    Object.entries(layers).forEach(([type, config]) => {
      // Skip if not a layer config (like markerIcon)
      if (!config || typeof config !== 'object' || !config[mode] || !config[mode].url) {
        return;
      }
      
      // Create the tile layer
      availableLayers[type] = L.tileLayer(config[mode].url, {
        attribution: config[mode].attribution
      });
    });
    
    // Store layers for reference
    layersRef.current = availableLayers;
    
    // Add the initial layer to the map
    if (availableLayers[activeLayer]) {
      availableLayers[activeLayer].addTo(map);
    } else {
      // Fallback to the first available layer if initial layer is not available
      const firstLayerKey = Object.keys(availableLayers)[0];
      if (firstLayerKey && availableLayers[firstLayerKey]) {
        availableLayers[firstLayerKey].addTo(map);
        setActiveLayer(firstLayerKey);
      }
    }
    
    // Create Leaflet control for layer switching
    const LayerControl = L.Control.extend({
      onAdd: () => {
        // Create container
        const container = L.DomUtil.create(
          'div', 
          'leaflet-control-layers leaflet-control leaflet-bar'
        );
        
        // Create buttons container
        const buttonsContainer = L.DomUtil.create(
          'div',
          'flex flex-col bg-textured p-1 rounded shadow',
          container
        );
        
        // Add buttons for each layer
        Object.entries(availableLayers).forEach(([type, tileLayer]) => {
          if (!layers[type] || !layers[type][mode]) return;
          
          // Add button for this layer
          const buttonClasses = `
            flex items-center justify-center w-8 h-8 mb-1 rounded
            ${activeLayer === type ? 
              'bg-blue-500 text-white' : 
              'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}
            hover:bg-blue-400 dark:hover:bg-blue-600
          `;
          
          const button = L.DomUtil.create('button', buttonClasses, buttonsContainer);
          button.title = layers[type][mode].name || type;
          button.innerHTML = layers[type][mode].icon || type.charAt(0).toUpperCase();
          
          // Switch to this layer when clicked
          L.DomEvent.on(button, 'click', () => {
            // Skip if already on this layer
            if (activeLayer === type) return;
            
            // Remove all layers
            Object.values(availableLayers).forEach(layer => {
              if (map.hasLayer(layer)) {
                map.removeLayer(layer);
              }
            });
            
            // Add the selected layer
            tileLayer.addTo(map);
            
            // Update active state visually
            const allButtons = buttonsContainer.querySelectorAll('button');
            allButtons.forEach(btn => {
              btn.classList.remove('bg-blue-500', 'text-white');
              btn.classList.add('bg-gray-200', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
            });
            
            button.classList.remove('bg-gray-200', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
            button.classList.add('bg-blue-500', 'text-white');
            
            // Update active layer state
            setActiveLayer(type);
            
            // Call the onLayerChange callback if provided
            if (onLayerChange) {
              onLayerChange(type);
            }
          });
        });
        
        // Prevent propagation of map events
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);
        
        return container;
      }
    });
    
    // Add the control to the map
    layerControlRef.current = new LayerControl({ position }).addTo(map);
    
    // Cleanup on unmount
    return () => {
      if (layerControlRef.current) {
        map.removeControl(layerControlRef.current);
      }
    };
  }, [map, layers, mode, position, onLayerChange]); // Remove activeLayer dependency here
  
  return null;
} 