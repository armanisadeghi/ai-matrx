'use client';

import { useState, useEffect } from 'react';
import { Marker, Popup, useMapEvents } from 'react-leaflet';
import { Icon } from 'leaflet';
import L from 'leaflet';

interface LocationMarkerProps {
  icon?: Icon;
  buttonPosition?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
  buttonIcon?: string;
  showPopup?: boolean;
  popupContent?: (position: [number, number]) => React.ReactNode;
  onLocationFound?: (position: [number, number]) => void;
  flyToLocation?: boolean;
  maxZoom?: number;
}

export default function LocationMarker({ 
  icon, 
  buttonPosition = 'topleft',
  buttonIcon = '📍',
  showPopup = true,
  popupContent,
  onLocationFound,
  flyToLocation = true,
  maxZoom = 16
}: LocationMarkerProps) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  
  const map = useMapEvents({
    locationfound: (e) => {
      const newPosition: [number, number] = [e.latlng.lat, e.latlng.lng];
      setPosition(newPosition);
      
      if (flyToLocation) {
        map.flyTo(e.latlng, Math.min(map.getZoom(), maxZoom));
      }
      
      if (onLocationFound) {
        onLocationFound(newPosition);
      }
      
      setIsLocating(false);
    },
    locationerror: () => {
      setIsLocating(false);
      alert('Could not find your location. Please make sure location services are enabled.');
    }
  });

  // Add a locate button to the map
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Create custom locate button
      const locateButton = document.createElement('button');
      locateButton.innerHTML = buttonIcon;
      locateButton.className = 'leaflet-bar leaflet-control leaflet-control-custom bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-black dark:text-white p-2 rounded-lg shadow-md';
      locateButton.style.fontSize = '20px';
      locateButton.style.cursor = 'pointer';
      locateButton.title = 'Find my location';
      
      locateButton.onclick = () => {
        setIsLocating(true);
        map.locate({
          setView: flyToLocation,
          maxZoom: maxZoom
        });
      };
      
      // Create a custom control with our button
      const locateControl = L.Control.extend({
        options: {
          position: buttonPosition
        },
        onAdd: () => {
          const container = document.createElement('div');
          container.className = 'leaflet-control-locate';
          container.appendChild(locateButton);
          return container;
        }
      });
      
      // Add the control to the map
      new locateControl().addTo(map);
      
      // Cleanup on unmount
      return () => {
        // No explicit cleanup needed as the control is attached to the map
      };
    }
  }, [map, buttonPosition, buttonIcon, flyToLocation, maxZoom]);

  // If no position or popup disabled, return null
  if (position === null || !showPopup) return null;
  
  return (
    <Marker position={position} icon={icon}>
      <Popup>
        {popupContent ? popupContent(position) : (
          <div>
            <h3 className="font-bold mb-1">Your Location</h3>
            <p className="text-sm">Latitude: {position[0].toFixed(6)}</p>
            <p className="text-sm">Longitude: {position[1].toFixed(6)}</p>
          </div>
        )}
      </Popup>
    </Marker>
  );
} 