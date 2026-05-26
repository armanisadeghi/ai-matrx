'use client';

import { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useAppSelector } from '@/lib/redux/hooks';

interface SearchControlProps {
  position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
  width?: number;
  placeholder?: string;
}

export default function SearchControl({ 
  position = 'topright', 
  width = 200,
  placeholder = 'Search for a location'
}: SearchControlProps) {
  const map = useMap();
  const mode = useAppSelector((s) => s.theme.mode);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchControlRef = useRef<any>(null);
  
  // This effect runs only once when the component mounts
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Create custom search control
    const SearchControl = L.Control.extend({
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-control-search leaflet-bar leaflet-control');
        
        const form = L.DomUtil.create('form', 'flex', container);
        const input = L.DomUtil.create('input', `p-2 text-sm rounded-l-md border border-border dark:bg-zinc-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400`, form);
        searchInputRef.current = input as HTMLInputElement;
        
        const button = L.DomUtil.create('button', `p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-r-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400`, form);
        
        input.type = 'text';
        input.placeholder = placeholder;
        input.style.minWidth = `${width}px`;
        
        button.type = 'submit';
        button.innerHTML = '🔍';
        
        // Prevent propagation of map events
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);
        
        // Handle input changes - but don't update state on every keystroke
        L.DomEvent.on(input, 'input', (e: Event) => {
          // Just let the input update naturally, we'll get the value on submit
        });
        
        // Handle form submission
        L.DomEvent.on(form, 'submit', async (e) => {
          e.preventDefault();
          const currentSearchTerm = searchInputRef.current?.value || '';
          if (!currentSearchTerm.trim()) return;
          
          setIsSearching(true);
          try {
            // Use Nominatim for geocoding (OpenStreetMap's geocoding service)
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(currentSearchTerm)}`);
            const data = await response.json();
            
            if (data && data.length > 0) {
              const { lat, lon, display_name } = data[0];
              const position: [number, number] = [parseFloat(lat), parseFloat(lon)];
              map.flyTo(position, 13);
              
              // Add a temporary marker
              const marker = L.marker(position)
                .addTo(map)
                .bindPopup(`<b>${display_name}</b>`)
                .openPopup();
              
              // Remove marker after some time
              setTimeout(() => {
                map.removeLayer(marker);
              }, 5000);
            } else {
              alert('Location not found. Please try a different search term.');
            }
          } catch (error) {
            console.error('Error searching for location:', error);
            alert('Error searching for location. Please try again.');
          } finally {
            setIsSearching(false);
          }
        });
        
        return container;
      }
    });
    
    // Add the control to the map
    searchControlRef.current = new SearchControl({ position }).addTo(map);
    
    // Cleanup on unmount
    return () => {
      if (searchControlRef.current) {
        map.removeControl(searchControlRef.current);
      }
    };
  }, [map, position, placeholder, width]); // Dependencies updated
  
  return null;
} 