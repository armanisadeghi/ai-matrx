'use client'


import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const CardTest = () => {
  return (
    <div className="w-full p-6 flex flex-col gap-6">
      <h2 className="text-xl font-bold text-foreground">Card Color Test</h2>

      {/* Custom-built card using utility classes */}
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
        <h3 className="text-2xl font-semibold mb-2">Custom Card</h3>
        <p className="text-base">This is text in a custom-built card using bg-card and text-card-foreground classes.</p>
      </div>
      
      {/* Same card with forced light text for comparison */}
      <div className="rounded-lg border bg-card shadow-sm p-6">
        <h3 className="text-2xl font-semibold mb-2 text-white">Custom Card (White Text)</h3>
        <p className="text-base text-white">This text is explicitly white for comparison.</p>
      </div>
      
      {/* shadcn/ui Card component */}
      <Card>
        <CardHeader>
          <CardTitle>shadcn/ui Card</CardTitle>
          <CardDescription>This is using the shadcn/ui Card component</CardDescription>
        </CardHeader>
        <CardContent>
          <p>This text is inside a CardContent component.</p>
          <div className="mt-4 space-y-2">
            <Label htmlFor="test-input">Test Input</Label>
            <Input id="test-input" placeholder="Input field" />
          </div>
        </CardContent>
        <CardFooter>
          <Button>Sample Button</Button>
        </CardFooter>
      </Card>
      
      {/* shadcn/ui Tabs component for additional testing */}
      <Tabs defaultValue="tab1" className="w-full">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1" className="p-4 bg-card rounded-md mt-2">
          <h3 className="font-medium">Tab 1 Content</h3>
          <p className="mt-2">Text inside a TabsContent with bg-card class.</p>
        </TabsContent>
        <TabsContent value="tab2" className="p-4 bg-card rounded-md mt-2">
          <h3 className="font-medium">Tab 2 Content</h3>
          <p className="mt-2">More text inside TabsContent to check coloring.</p>
        </TabsContent>
      </Tabs>
      
      {/* Display the actual color values for debugging */}
      <div className="mt-4 p-4 rounded bg-card border">
        <h3 className="font-medium mb-2 text-card-foreground">Current Color Values:</h3>
        <ul className="space-y-1 text-sm">
          <li className="text-card-foreground">--background: var(--background)</li>
          <li className="text-card-foreground">--card: var(--card)</li>
          <li className="text-card-foreground">--card-foreground: var(--card-foreground)</li>
          <li className="text-card-foreground">--foreground: var(--foreground)</li>
          <li className="text-card-foreground">--primary: var(--primary)</li>
          <li className="text-card-foreground">--primary-foreground: var(--primary-foreground)</li>
        </ul>
      </div>
    </div>
  );
};

export default CardTest;