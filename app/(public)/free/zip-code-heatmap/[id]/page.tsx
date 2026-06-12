'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MapPin, Loader2, AlertCircle, ArrowLeft, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/utils/supabase/client';
import ZipCodeMap from "../components/ZipCodeMap";
import ColorLegend from "../components/ColorLegend";
import type { ColorScaleOptions } from '../components/ColorScaleSelector';
import type { ViewMode } from '../components/ViewModeSelector';
import type { ZipCodeData } from '../page';

interface SavedHeatmap {
  id: string;
  title: string;
  description: string | null;
  data: ZipCodeData[];
  view_settings: {
    viewMode: ViewMode;
    scalingMethod: ColorScaleOptions['scalingMethod'];
    colorScheme: ColorScaleOptions['colorScheme'];
  };
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export default function SharedHeatmapPage() {
  const params = useParams();
  const router = useRouter();
  const heatmapId = params.id as string;

  const [heatmap, setHeatmap] = useState<SavedHeatmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (heatmapId) {
      loadHeatmap();
    }
  }, [heatmapId]);

  const loadHeatmap = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('heatmap_saves')
        .select('*')
        .eq('id', heatmapId)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          setError('Heatmap not found');
        } else {
          throw fetchError;
        }
        return;
      }

      if (!data) {
        setError('Heatmap not found');
        return;
      }

      // Check if user has access
      if (!data.is_public) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || user.id !== data.user_id) {
          setError('You do not have permission to view this heatmap');
          return;
        }
      }

      setHeatmap(data as SavedHeatmap);
    } catch (err) {
      console.error('Error loading heatmap:', err);
      setError('Failed to load heatmap');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToEditor = () => {
    router.push('/free/zip-code-heatmap');
  };

  if (loading) {
    return (
      <div className="h-[calc(100dvh-2.5rem)] flex items-center justify-center bg-textured">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading heatmap...</p>
        </div>
      </div>
    );
  }

  if (error || !heatmap) {
    return (
      <div className="h-[calc(100dvh-2.5rem)] flex items-center justify-center bg-textured p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive mb-2">
              <AlertCircle className="w-5 h-5" />
              <CardTitle>Error</CardTitle>
            </div>
            <CardDescription>{error || 'Heatmap not found'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleBackToEditor} className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go to Heatmap Editor
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const maxCount = Math.max(...heatmap.data.map((d) => d.count));
  const minCount = Math.min(...heatmap.data.map((d) => d.count));

  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-background/95 backdrop-blur-sm">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToEditor}
              className="flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{heatmap.title}</h1>
              {heatmap.description && (
                <p className="text-sm text-muted-foreground truncate">{heatmap.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0">
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>{heatmap.data.length} points</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>{new Date(heatmap.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Map and Legend */}
      <div className="flex-1 overflow-hidden p-4">
        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4 h-full">
          {/* Sidebar with Legend and Info */}
          <div className="space-y-4 overflow-y-auto">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Legend</CardTitle>
              </CardHeader>
              <CardContent>
                <ColorLegend
                  minValue={minCount}
                  maxValue={maxCount}
                  scalingMethod={heatmap.view_settings.scalingMethod}
                  colorScheme={heatmap.view_settings.colorScheme}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Points:</span>
                  <span className="font-semibold">{heatmap.data.length}</span>
                </div>
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
                    {heatmap.data.reduce((sum, d) => sum + d.count, 0).toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">View Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">View Mode:</span>
                  <span className="font-semibold capitalize">
                    {heatmap.view_settings.viewMode === 'zipCode'
                      ? 'Individual Zip Codes'
                      : heatmap.view_settings.viewMode === 'zip3'
                      ? 'ZIP-3 Regions'
                      : 'County Level'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scaling:</span>
                  <span className="font-semibold capitalize">
                    {heatmap.view_settings.scalingMethod}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Color Scheme:</span>
                  <span className="font-semibold">
                    {heatmap.view_settings.colorScheme === 'yellowRed'
                      ? 'Yellow to Red'
                      : heatmap.view_settings.colorScheme === 'blueRed'
                      ? 'Blue to Red'
                      : heatmap.view_settings.colorScheme === 'greenBlue'
                      ? 'Green to Blue'
                      : heatmap.view_settings.colorScheme === 'purpleOrange'
                      ? 'Purple to Orange'
                      : heatmap.view_settings.colorScheme === 'rainbow'
                      ? 'Rainbow'
                      : 'Viridis'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Map */}
          <div className="h-full overflow-hidden rounded-lg border bg-card shadow-sm">
            <ZipCodeMap
              data={heatmap.data}
              isLoading={false}
              scalingMethod={heatmap.view_settings.scalingMethod}
              colorScheme={heatmap.view_settings.colorScheme}
              viewMode={heatmap.view_settings.viewMode}
              isFullscreen={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

