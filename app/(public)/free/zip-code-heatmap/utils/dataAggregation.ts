import { ZipCodeData } from '../page';

export interface AggregatedData {
  id: string;
  label: string;
  count: number;
  zipCodes: string[];
  representativeZip: string; // Actual zip code to use for geocoding
}

/**
 * Get ZIP-3 code (first 3 digits)
 */
export function getZip3(zipCode: string): string {
  return zipCode.substring(0, 3);
}

/**
 * Aggregate zip codes by ZIP-3 region
 */
export function aggregateByZip3(data: ZipCodeData[]): AggregatedData[] {
  const grouped = new Map<string, AggregatedData>();

  data.forEach(item => {
    const zip3 = getZip3(item.zipCode);
    const existing = grouped.get(zip3);

    if (existing) {
      existing.count += item.count;
      existing.zipCodes.push(item.zipCode);
    } else {
      grouped.set(zip3, {
        id: zip3,
        label: `ZIP ${zip3}xx`,
        count: item.count,
        zipCodes: [item.zipCode],
        representativeZip: item.zipCode, // Use first zip code as representative
      });
    }
  });

  return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
}

/**
 * Lookup table for ZIP to County
 * This is a simplified mapping - in production, you'd want a complete database
 */
const ZIP_TO_COUNTY: Record<string, { county: string; state: string }> = {
  // California examples
  '92617': { county: 'Orange County', state: 'CA' },
  '92618': { county: 'Orange County', state: 'CA' },
  '92614': { county: 'Orange County', state: 'CA' },
  '92612': { county: 'Orange County', state: 'CA' },
  '92602': { county: 'Orange County', state: 'CA' },
  '92603': { county: 'Orange County', state: 'CA' },
  '92604': { county: 'Orange County', state: 'CA' },
  '92606': { county: 'Orange County', state: 'CA' },
  '92780': { county: 'Orange County', state: 'CA' },
  '92782': { county: 'Orange County', state: 'CA' },
  // LA County examples
  '90001': { county: 'Los Angeles County', state: 'CA' },
  '90002': { county: 'Los Angeles County', state: 'CA' },
  '90003': { county: 'Los Angeles County', state: 'CA' },
  '90004': { county: 'Los Angeles County', state: 'CA' },
  '90005': { county: 'Los Angeles County', state: 'CA' },
};

/**
 * Get county info from zip code using an API
 */
export async function getCountyForZip(zipCode: string): Promise<{ county: string; state: string } | null> {
  // Check local cache first
  if (ZIP_TO_COUNTY[zipCode]) {
    return ZIP_TO_COUNTY[zipCode];
  }

  // Try to get from zippopotam.us API
  try {
    const response = await fetch(`https://api.zippopotam.us/us/${zipCode}`);
    if (response.ok) {
      const data = await response.json();
      if (data.places && data.places.length > 0) {
        const place = data.places[0];
        // Note: zippopotam doesn't provide county, so we'd need another service
        // For now, we'll use the place name as a proxy
        return {
          county: place['place name'],
          state: place['state abbreviation'],
        };
      }
    }
  } catch (error) {
    console.error(`Error fetching county for ${zipCode}:`, error);
  }

  return null;
}

/**
 * Aggregate zip codes by county
 * Note: This requires county data which may need additional API calls
 */
export async function aggregateByCounty(data: ZipCodeData[]): Promise<AggregatedData[]> {
  const grouped = new Map<string, AggregatedData>();

  // Process all zip codes
  for (const item of data) {
    const countyInfo = await getCountyForZip(item.zipCode);
    
    if (countyInfo) {
      const countyKey = `${countyInfo.county}, ${countyInfo.state}`;
      const existing = grouped.get(countyKey);

      if (existing) {
        existing.count += item.count;
        existing.zipCodes.push(item.zipCode);
      } else {
        grouped.set(countyKey, {
          id: countyKey,
          label: countyKey,
          count: item.count,
          zipCodes: [item.zipCode],
          representativeZip: item.zipCode,
        });
      }
    } else {
      // If county unknown, group under "Unknown"
      const unknownKey = 'Unknown County';
      const existing = grouped.get(unknownKey);

      if (existing) {
        existing.count += item.count;
        existing.zipCodes.push(item.zipCode);
      } else {
        grouped.set(unknownKey, {
          id: unknownKey,
          label: unknownKey,
          count: item.count,
          zipCodes: [item.zipCode],
          representativeZip: item.zipCode,
        });
      }
    }
  }

  return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
}

/**
 * Get statistics for aggregated data
 */
export function getAggregationStats(aggregated: AggregatedData[]) {
  const totalRegions = aggregated.length;
  const totalCount = aggregated.reduce((sum, item) => sum + item.count, 0);
  const maxCount = Math.max(...aggregated.map(item => item.count));
  const minCount = Math.min(...aggregated.map(item => item.count));
  const avgZipsPerRegion = aggregated.reduce((sum, item) => sum + item.zipCodes.length, 0) / totalRegions;

  return {
    totalRegions,
    totalCount,
    maxCount,
    minCount,
    avgZipsPerRegion: Math.round(avgZipsPerRegion * 10) / 10,
  };
}

