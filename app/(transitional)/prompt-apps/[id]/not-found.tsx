import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="h-page flex items-center justify-center bg-textured">
      <div className="text-center space-y-4 max-w-md">
        <div className="flex justify-center">
          <div className="p-3 bg-destructive/10 rounded-full">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">App Not Found</h1>
          <p className="text-muted-foreground mt-2">
            This app doesn't exist or you don't have permission to access it.
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <Link href="/prompt-apps">
            <Button>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Apps
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

