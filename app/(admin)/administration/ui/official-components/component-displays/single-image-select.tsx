'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { SingleImageSelect } from '@/components/image/shared/SingleImageSelect';
import { useSelectedImages } from '@/components/image/context/SelectedImagesProvider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Camera, User, Shield } from 'lucide-react';
import { Input } from "@/components/ui/input";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

// Sample image URLs for demos
const sampleImageUrls = [
  'https://images.unsplash.com/photo-1614974121916-81eadb4dd6b2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHw5fHxsYXMlMjBWZWdhc3xlbnwwfHx8fDE3Mzk3NzI3NDJ8MA&ixlib=rb-4.0.3&q=80&w=1080',
  'https://images.unsplash.com/photo-1605379399843-5870eea9b74e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHwxOXx8Y29kaW5nfGVufDB8fHx8MTczOTg1MDkwOXww&ixlib=rb-4.0.3&q=80&w=1080',
  'https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?crop=entropy&cs=srgb&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHwxOHx8ZGlnaXRhbCUyMHJlcG9ydHxlbnwwfHx8fDE3NDU3NjgzNTJ8MA&ixlib=rb-4.0.3&q=85'
];

export default function SingleImageSelectDemo({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  return (
    <Tabs defaultValue="basic">
      <TabsList className="mb-4">
        <TabsTrigger value="basic">Basic Usage</TabsTrigger>
        <TabsTrigger value="sizes">Size Options</TabsTrigger>
        <TabsTrigger value="shapes">Shapes & Aspect Ratios</TabsTrigger>
        <TabsTrigger value="real-world">Real-World Examples</TabsTrigger>
      </TabsList>
      
      <TabsContent value="basic">
        <ComponentDisplayWrapper
          component={component}
          code={`import { SingleImageSelect } from '@/components/image/shared/SingleImageSelect';
import { useSelectedImages } from '@/components/image/context/SelectedImagesProvider';
import { Button } from '@/components/ui/button';

function BasicExample() {
  const { clearImages } = useSelectedImages();
  
  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-4">
        <SingleImageSelect 
          size="lg"
          placeholder="Click to select image"
        />
        
        <p className="text-sm text-gray-500">
          Click the box above to select an image
        </p>
      </div>
      
      <Button
        variant="outline"
        size="sm"
        onClick={clearImages}
      >
        Clear Image
      </Button>
    </div>
  );
}`}
          description="The SingleImageSelect component provides a simple way to select a single image. It displays a placeholder when no image is selected, and shows the selected image once chosen."
        >
          <BasicUsageDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="sizes">
        <ComponentDisplayWrapper
          component={component}
          code={`import { SingleImageSelect } from '@/components/image/shared/SingleImageSelect';

function SizesExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
      <div className="flex flex-col items-center gap-2">
        <SingleImageSelect 
          size="sm"
          placeholder="Small"
        />
        <span className="text-sm">Small</span>
      </div>
      
      <div className="flex flex-col items-center gap-2">
        <SingleImageSelect 
          size="md"
          placeholder="Medium"
        />
        <span className="text-sm">Medium (Default)</span>
      </div>
      
      <div className="flex flex-col items-center gap-2">
        <SingleImageSelect 
          size="lg"
          placeholder="Large"
        />
        <span className="text-sm">Large</span>
      </div>
      
      <div className="flex flex-col items-center gap-2">
        <SingleImageSelect 
          size="xl"
          placeholder="Extra Large"
        />
        <span className="text-sm">Extra Large</span>
      </div>
    </div>
  );
}`}
          description="Choose from four different size options for the SingleImageSelect component to fit your design needs."
        >
          <SizesDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="shapes">
        <ComponentDisplayWrapper
          component={component}
          code={`import { SingleImageSelect } from '@/components/image/shared/SingleImageSelect';

function ShapesExample() {
  return (
    <div className="space-y-10">
      <div>
        <h3 className="text-sm font-medium mb-4">Border Radius Options</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-6">
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              radius="none"
              placeholder="None"
            />
            <span className="text-sm">None</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              radius="sm"
              placeholder="Small"
            />
            <span className="text-sm">Small</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              radius="md"
              placeholder="Medium"
            />
            <span className="text-sm">Medium (Default)</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              radius="lg"
              placeholder="Large"
            />
            <span className="text-sm">Large</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              radius="full"
              placeholder="Full"
            />
            <span className="text-sm">Full (Circle)</span>
          </div>
        </div>
      </div>
      
      <div>
        <h3 className="text-sm font-medium mb-4">Aspect Ratio Options</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              aspectRatio="square"
              placeholder="Square"
              size="lg"
            />
            <span className="text-sm">Square (Default)</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              aspectRatio="portrait"
              placeholder="Portrait"
              size="lg"
            />
            <span className="text-sm">Portrait (3:4)</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              aspectRatio="landscape"
              placeholder="Landscape"
              size="lg"
            />
            <span className="text-sm">Landscape (4:3)</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              aspectRatio="video"
              placeholder="Video"
              size="lg"
            />
            <span className="text-sm">Video (16:9)</span>
          </div>
        </div>
      </div>
    </div>
  );
}`}
          description="Customize the appearance of the SingleImageSelect with different border radius options and aspect ratios to suit various content types."
        >
          <ShapesDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="real-world">
        <ComponentDisplayWrapper
          component={component}
          code={`import { SingleImageSelect } from '@/components/image/shared/SingleImageSelect';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { User, Camera, Shield } from 'lucide-react';

function RealWorldExample() {
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>User Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <SingleImageSelect 
                size="lg"
                radius="full"
                placeholder="Add Avatar"
                customPlaceholder={
                  <div className="flex flex-col items-center justify-center">
                    <User className="h-8 w-8 text-gray-400 dark:text-gray-600 mb-1" />
                    <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                      Add Profile Photo
                    </p>
                  </div>
                }
              />
              <p className="text-xs text-gray-500">Click to upload profile picture</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" placeholder="John Doe" />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="john@example.com" />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full">Update Profile</Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Product Listing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <SingleImageSelect 
                size="xl"
                aspectRatio="landscape"
                placeholder="Add Product Image"
                customPlaceholder={
                  <div className="flex flex-col items-center justify-center">
                    <Camera className="h-8 w-8 text-gray-400 dark:text-gray-600 mb-1" />
                    <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                      Add Product Photo
                    </p>
                  </div>
                }
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="product-name">Product Name</Label>
              <Input id="product-name" placeholder="Premium Widget" />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input id="price" type="number" placeholder="99.99" />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full">Add Product</Button>
          </CardFooter>
        </Card>
      </div>
      
      <div>
        <Card>
          <CardHeader>
            <CardTitle>Company Verification</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label className="block mb-1">Company Logo</Label>
                <SingleImageSelect 
                  aspectRatio="square"
                  size="lg"
                  placeholder="Add Logo"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="block mb-1">Business License</Label>
                <SingleImageSelect 
                  aspectRatio="landscape"
                  size="lg"
                  placeholder="Upload License"
                  customPlaceholder={
                    <div className="flex flex-col items-center justify-center">
                      <Shield className="h-8 w-8 text-gray-400 dark:text-gray-600 mb-1" />
                      <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                        Upload License
                      </p>
                    </div>
                  }
                />
              </div>
              
              <div className="space-y-2">
                <Label className="block mb-1">Office Photo</Label>
                <SingleImageSelect 
                  aspectRatio="landscape"
                  size="lg"
                  placeholder="Office Photo"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full">Submit for Verification</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}`}
          description="See how the SingleImageSelect component can be integrated into real-world applications like user profiles, product listings, and verification forms."
        >
          <RealWorldExamplesDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
    </Tabs>
  );
}

// Basic usage demo component
function BasicUsageDemo() {
  const { clearImages } = useSelectedImages();
  
  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col items-center gap-4">
        <SingleImageSelect 
          size="lg"
          placeholder="Click to select image"
          imageManagerProps={{
            userImages: sampleImageUrls
          }}
        />
        
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Click the box above to select an image
        </p>
      </div>
      
      <div className="flex justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={clearImages}
        >
          Clear Image
        </Button>
      </div>
    </div>
  );
}

// Sizes demo component
function SizesDemo() {
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <div className="flex flex-col items-center gap-2">
          <SingleImageSelect 
            size="sm"
            placeholder="Small"
            imageManagerProps={{
              userImages: sampleImageUrls
            }}
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">Small</span>
        </div>
        
        <div className="flex flex-col items-center gap-2">
          <SingleImageSelect 
            size="md"
            placeholder="Medium"
            imageManagerProps={{
              userImages: sampleImageUrls
            }}
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">Medium (Default)</span>
        </div>
        
        <div className="flex flex-col items-center gap-2">
          <SingleImageSelect 
            size="lg"
            placeholder="Large"
            imageManagerProps={{
              userImages: sampleImageUrls
            }}
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">Large</span>
        </div>
        
        <div className="flex flex-col items-center gap-2">
          <SingleImageSelect 
            size="xl"
            placeholder="Extra Large"
            imageManagerProps={{
              userImages: sampleImageUrls
            }}
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">Extra Large</span>
        </div>
      </div>
    </div>
  );
}

// Shapes and aspect ratios demo component
function ShapesDemo() {
  return (
    <div className="w-full space-y-10">
      <div>
        <h3 className="text-sm font-medium mb-4 text-gray-700 dark:text-gray-300">Border Radius Options</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-6">
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              radius="none"
              placeholder="None"
              imageManagerProps={{
                userImages: sampleImageUrls
              }}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">None</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              radius="sm"
              placeholder="Small"
              imageManagerProps={{
                userImages: sampleImageUrls
              }}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Small</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              radius="md"
              placeholder="Medium"
              imageManagerProps={{
                userImages: sampleImageUrls
              }}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Medium (Default)</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              radius="lg"
              placeholder="Large"
              imageManagerProps={{
                userImages: sampleImageUrls
              }}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Large</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              radius="full"
              placeholder="Full"
              imageManagerProps={{
                userImages: sampleImageUrls
              }}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Full (Circle)</span>
          </div>
        </div>
      </div>
      
      <div>
        <h3 className="text-sm font-medium mb-4 text-gray-700 dark:text-gray-300">Aspect Ratio Options</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              aspectRatio="square"
              placeholder="Square"
              size="lg"
              imageManagerProps={{
                userImages: sampleImageUrls
              }}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Square (Default)</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              aspectRatio="portrait"
              placeholder="Portrait"
              size="lg"
              imageManagerProps={{
                userImages: sampleImageUrls
              }}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Portrait (3:4)</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              aspectRatio="landscape"
              placeholder="Landscape"
              size="lg"
              imageManagerProps={{
                userImages: sampleImageUrls
              }}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Landscape (4:3)</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <SingleImageSelect 
              aspectRatio="video"
              placeholder="Video"
              size="lg"
              imageManagerProps={{
                userImages: sampleImageUrls
              }}
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Video (16:9)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Real-world examples demo component
function RealWorldExamplesDemo() {
  return (
    <div className="w-full space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>User Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <SingleImageSelect 
                size="lg"
                radius="full"
                placeholder="Add Avatar"
                imageManagerProps={{
                  userImages: sampleImageUrls
                }}
                customPlaceholder={
                  <div className="flex flex-col items-center justify-center">
                    <User className="h-8 w-8 text-gray-400 dark:text-gray-600 mb-1" />
                    <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                      Add Profile Photo
                    </p>
                  </div>
                }
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">Click to upload profile picture</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" placeholder="John Doe" />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="john@example.com" />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full">Update Profile</Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Product Listing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <SingleImageSelect 
                size="xl"
                aspectRatio="landscape"
                placeholder="Add Product Image"
                imageManagerProps={{
                  userImages: sampleImageUrls
                }}
                customPlaceholder={
                  <div className="flex flex-col items-center justify-center">
                    <Camera className="h-8 w-8 text-gray-400 dark:text-gray-600 mb-1" />
                    <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                      Add Product Photo
                    </p>
                  </div>
                }
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="product-name">Product Name</Label>
              <Input id="product-name" placeholder="Premium Widget" />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input id="price" type="number" placeholder="99.99" />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full">Add Product</Button>
          </CardFooter>
        </Card>
      </div>
      
      <div>
        <Card>
          <CardHeader>
            <CardTitle>Company Verification</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label className="block mb-1">Company Logo</Label>
                <SingleImageSelect 
                  aspectRatio="square"
                  size="lg"
                  placeholder="Add Logo"
                  imageManagerProps={{
                    userImages: sampleImageUrls
                  }}
                />
              </div>
              
              <div className="space-y-2">
                <Label className="block mb-1">Business License</Label>
                <SingleImageSelect 
                  aspectRatio="landscape"
                  size="lg"
                  placeholder="Upload License"
                  imageManagerProps={{
                    userImages: sampleImageUrls
                  }}
                  customPlaceholder={
                    <div className="flex flex-col items-center justify-center">
                      <Shield className="h-8 w-8 text-gray-400 dark:text-gray-600 mb-1" />
                      <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                        Upload License
                      </p>
                    </div>
                  }
                />
              </div>
              
              <div className="space-y-2">
                <Label className="block mb-1">Office Photo</Label>
                <SingleImageSelect 
                  aspectRatio="landscape"
                  size="lg"
                  placeholder="Office Photo"
                  imageManagerProps={{
                    userImages: sampleImageUrls
                  }}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full">Submit for Verification</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
} 