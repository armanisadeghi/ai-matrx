'use client';
import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Copy, Check, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@ai-matrx/design-system";

interface SEOImageMetadata {
  url: string;
  metaTitle?: string;
  description?: string;
  suggestedMetaTitles?: string[];
}

interface SEOImageViewerProps {
  images: string[];
  metadata?: Record<string, SEOImageMetadata>;
  onRequestMetadata?: (imageUrl: string) => Promise<SEOImageMetadata>;
}

export function SEOImageViewer({ 
  images, 
  metadata = {}, 
  onRequestMetadata 
}: SEOImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showSEO, setShowSEO] = useState(false);
  const [isCopied, setIsCopied] = useState<string | null>(null);
  const [imageMetadata, setImageMetadata] = useState<Record<string, SEOImageMetadata>>(metadata);
  const { toast } = useToast();

  // Current image URL
  const currentImageUrl = images[currentIndex];
  const currentMetadata = imageMetadata[currentImageUrl] || { url: currentImageUrl };

  // Fetch metadata for the current image if not available
  useEffect(() => {
    const fetchMetadata = async () => {
      if (!imageMetadata[currentImageUrl] && onRequestMetadata) {
        setIsLoading(true);
        try {
          const data = await onRequestMetadata(currentImageUrl);
          setImageMetadata(prev => ({
            ...prev,
            [currentImageUrl]: data
          }));
        } catch (error) {
          console.error("Failed to fetch metadata:", error);
          toast({
            title: "Error",
            description: "Failed to fetch image metadata",
            variant: "destructive"
          });
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    fetchMetadata();
  }, [currentImageUrl, imageMetadata, onRequestMetadata, toast]);

  // Navigate to next/previous image
  const goToNextImage = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    setShowSEO(false);
    setImageError(false);
  };

  const goToPreviousImage = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + images.length) % images.length);
    setShowSEO(false);
    setImageError(false);
  };

  // Copy text to clipboard
  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setIsCopied(type);
        setTimeout(() => setIsCopied(null), 2000);
        toast({
          title: "Copied to clipboard",
          description: `${type} has been copied to your clipboard.`
        });
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        toast({
          title: "Copy failed",
          description: "There was an issue copying to your clipboard.",
          variant: "destructive"
        });
      });
  };

  // Handle image load/error
  const handleImageLoad = () => {
    setImageError(false);
  };

  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <div className="flex flex-col lg:flex-row w-full gap-6 rounded-lg overflow-hidden">
      {/* Left Column - Image */}
      <div className="w-full lg:w-1/3 flex flex-col">
        <div className="relative bg-neutral-50 dark:bg-neutral-900 rounded-lg overflow-hidden shadow-md min-h-[300px] flex items-center justify-center">
          {isLoading ? (
            <Skeleton className="w-full h-full absolute inset-0" />
          ) : imageError ? (
            <div className="text-center p-8">
              <p className="text-muted-foreground">Image failed to load</p>
              <p className="text-sm text-muted-foreground break-all mt-2">{currentImageUrl}</p>
            </div>
          ) : (
            <img
              src={currentImageUrl}
              alt={currentMetadata.metaTitle || "Image"}
              className="max-w-full max-h-[500px] object-contain"
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          )}
          
          {/* Navigation controls */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between p-2">
            <Button 
              variant="secondary" 
              size="icon" 
              onClick={goToPreviousImage} 
              className="rounded-full opacity-80 hover:opacity-100"
              disabled={images.length <= 1}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button 
              variant="secondary" 
              size="icon" 
              onClick={goToNextImage} 
              className="rounded-full opacity-80 hover:opacity-100"
              disabled={images.length <= 1}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Image count indicator */}
          <div className="absolute top-2 right-2 bg-black/50 text-white px-2 py-1 rounded text-xs font-medium">
            {currentIndex + 1} / {images.length}
          </div>
        </div>
        
        {/* Image URL */}
        <Card className="mt-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-sm text-muted-foreground flex-grow">
                {currentImageUrl.split('/').pop()}
              </div>
              <div className="flex gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8" 
                  onClick={() => copyToClipboard(currentImageUrl, 'URL')}
                >
                  {isCopied === 'URL' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8" 
                  onClick={() => window.open(currentImageUrl, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Right Column - Metadata and SEO */}
      <div className="w-full lg:w-2/3 flex flex-col">
        <Card className="h-full">
          <CardContent className="p-5 flex flex-col h-full">
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-3/4 mb-2" />
                <Skeleton className="h-32 w-full mb-4" />
                <Skeleton className="h-10 w-40" />
              </>
            ) : (
              <>
                {/* Meta Title */}
                <div className="mb-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold mb-1">Meta Title</h3>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8" 
                      onClick={() => copyToClipboard(currentMetadata.metaTitle || '', 'Meta Title')}
                    >
                      {isCopied === 'Meta Title' ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-muted-foreground">
                    {currentMetadata.metaTitle || "No meta title available"}
                  </p>
                </div>

                {/* SEO Recommendations Toggle */}
                <Button
                  variant="outline"
                  className="w-full justify-between mb-6"
                  onClick={() => setShowSEO(!showSEO)}
                >
                  <span>SEO Recommendations</span>
                  {showSEO ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>

                {/* SEO Recommendations Content */}
                {showSEO && (
                  <div className="space-y-6 flex-grow overflow-auto">
                    {/* Description */}
                    {currentMetadata.description && (
                      <div>
                        <div className="flex justify-between items-center">
                          <h4 className="font-medium mb-2">Description:</h4>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8" 
                            onClick={() => copyToClipboard(currentMetadata.description || '', 'Description')}
                          >
                            {isCopied === 'Description' ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">{currentMetadata.description}</p>
                      </div>
                    )}
                    
                    {/* Suggested Meta Titles */}
                    {currentMetadata.suggestedMetaTitles && currentMetadata.suggestedMetaTitles.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Suggested Meta Titles:</h4>
                        <ul className="space-y-3">
                          {currentMetadata.suggestedMetaTitles.map((title, index) => (
                            <li key={index} className="bg-secondary/50 p-3 rounded-md">
                              <div className="flex justify-between items-start gap-2">
                                <span className="text-sm">{title}</span>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 shrink-0 mt-0" 
                                  onClick={() => copyToClipboard(title, `Suggestion ${index + 1}`)}
                                >
                                  {isCopied === `Suggestion ${index + 1}` ? (
                                    <Check className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {!currentMetadata.description && (!currentMetadata.suggestedMetaTitles || currentMetadata.suggestedMetaTitles.length === 0) && (
                      <div className="text-center py-10">
                        <p className="text-muted-foreground">No SEO recommendations available</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}