// Minimal layout.tsx component for next.js

import { ReactNode } from 'react';
import { KindLeakSentinel } from '@/features/content-ir/surfaces/KindLeakSentinel';

export default function Layout({ children }: { children: ReactNode }) {
  // This group has no Providers / AppShell, so the leak sentinel that rides
  // DeferredSingletonCore is mounted here directly (K6).
  return (
    <div>
      {children}
      <KindLeakSentinel />
    </div>
  );
}