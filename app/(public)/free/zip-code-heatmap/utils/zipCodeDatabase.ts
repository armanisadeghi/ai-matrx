/**
 * US Zip Code Database Utilities
 * Uses a free zip code API for instant lookups
 */

interface ZipCodeCoordinates {
  lat: number;
  lng: number;
  city?: string;
  state?: string;
}

// Cache for zip code lookups
const zipCodeCache = new Map<string, ZipCodeCoordinates>();

/**
 * Load zip codes in bulk from a free API
 * Using zippopotam.us which has no rate limits for US data
 */
export async function getZipCodeCoordinates(zipCode: string): Promise<ZipCodeCoordinates | null> {
  // Clean the zip code
  const cleanZip = zipCode.trim().padStart(5, '0');
  
  // Check cache first
  const cached = zipCodeCache.get(cleanZip);
  if (cached) {
    return cached;
  }

  try {
    // Using zippopotam.us - free, no rate limits, no API key
    const response = await fetch(`https://api.zippopotam.us/us/${cleanZip}`);
    
    if (response.ok) {
      const data = await response.json();
      if (data.places && data.places.length > 0) {
        const place = data.places[0];
        const coords = {
          lat: parseFloat(place.latitude),
          lng: parseFloat(place.longitude),
          city: place['place name'],
          state: place['state abbreviation'],
        };
        zipCodeCache.set(cleanZip, coords);
        return coords;
      }
    }
    
    // Fallback: Try alternative service
    return await getZipCodeCoordinatesFallback(cleanZip);
  } catch (error) {
    console.error(`Error fetching coordinates for ${cleanZip}:`, error);
    return await getZipCodeCoordinatesFallback(cleanZip);
  }
}

/**
 * Fallback method using geocode.xyz (also free, no API key)
 */
async function getZipCodeCoordinatesFallback(zipCode: string): Promise<ZipCodeCoordinates | null> {
  try {
    const response = await fetch(
      `https://geocode.xyz/${zipCode}?json=1&region=US`,
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data.latt && data.longt) {
        const coords = {
          lat: parseFloat(data.latt),
          lng: parseFloat(data.longt),
        };
        zipCodeCache.set(zipCode, coords);
        return coords;
      }
    }
  } catch (error) {
    console.error(`Fallback error for ${zipCode}:`, error);
  }
  
  return null;
}

/**
 * Batch geocode multiple zip codes with parallel requests
 */
export async function batchGeocodeZipCodes(
  zipCodes: string[],
  onProgress?: (completed: number, total: number, currentResults: Map<string, ZipCodeCoordinates>) => void
): Promise<Map<string, ZipCodeCoordinates>> {
  const results = new Map<string, ZipCodeCoordinates>();
  const batchSize = 10; // Process 10 at a time
  
  for (let i = 0; i < zipCodes.length; i += batchSize) {
    const batch = zipCodes.slice(i, i + batchSize);
    
    // Process batch in parallel
    const promises = batch.map(async (zipCode) => {
      const coords = await getZipCodeCoordinates(zipCode);
      if (coords) {
        results.set(zipCode, coords);
      }
      return { zipCode, coords };
    });
    
    await Promise.all(promises);
    
    if (onProgress) {
      const completed = Math.min(i + batchSize, zipCodes.length);
      onProgress(completed, zipCodes.length, new Map(results));
    }
    
    // Small delay between batches to be respectful
    if (i + batchSize < zipCodes.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

/**
 * Clear the cache (useful for testing)
 */
export function clearZipCodeCache() {
  zipCodeCache.clear();
}

