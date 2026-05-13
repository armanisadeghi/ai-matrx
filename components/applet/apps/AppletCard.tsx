import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Link from 'next/link';
import { ArrowRight, User, Clock } from 'lucide-react';
import { InlineMediaRef } from '@/features/files';

interface Applet {
  id: string;
  name: string;
  description: string;
  creator: string;
  imageUrl?: string;
  lastUpdated?: string;
}

interface AppletCardProps {
  id: string;
  name: string;
  description: string;
  creator: string;
  imageUrl?: string;
  lastUpdated?: string;
}

interface AppletGridProps {
  applets: Applet[];
}

const AppletCard: React.FC<AppletCardProps> = ({ 
  id, 
  name, 
  description,
  creator, 
  imageUrl = '/api/placeholder/400/200',
  lastUpdated
}) => {
  return (
    <Link href={`/applet/${id}`} className="block group focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg">
      <Card className="h-full overflow-hidden bg-card hover:bg-accent/5 dark:bg-card dark:hover:bg-accent/5 transition-all duration-200 border dark:border-gray-800">
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          <InlineMediaRef
            ref={imageUrl ?? null}
            size="fill"
            fit="cover"
            rounded="none"
            fallback="icon"
            className="transition-transform duration-300 group-hover:scale-105"
            alt={`${name} thumbnail`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        </div>
        
        <CardHeader className="space-y-2 p-5">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold leading-tight line-clamp-1 group-hover:text-primary transition-colors">
              {name}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                <span className="font-medium">{creator}</span>
              </div>
            </div>
          </div>
          <CardDescription className="line-clamp-2 text-sm">
            {description}
          </CardDescription>
        </CardHeader>

        <CardFooter className="px-5 pb-5 pt-0">
          <div className="w-full flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {lastUpdated ? `Updated ${lastUpdated}` : ''}
            </span>
            <div className="text-sm font-medium text-primary flex items-center gap-1 group/button">
              Launch
              <ArrowRight className="w-4 h-4 transition-transform group-hover/button:translate-x-0.5" />
            </div>
          </div>
        </CardFooter>
      </Card>
    </Link>
  );
};

export const AppletGrid: React.FC<AppletGridProps> = ({ applets }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
      {applets.map((applet) => (
        <AppletCard
          key={applet.id}
          id={applet.id}
          name={applet.name}
          description={applet.description}
          creator={applet.creator}
          imageUrl={applet.imageUrl}
          lastUpdated={applet.lastUpdated}
        />
      ))}
    </div>
  );
};

export { type Applet };
export default AppletGrid;