'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to profile by default
    router.replace('/settings/profile');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto mb-4" />
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    </div>
  );
}

