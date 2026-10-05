'use client';

import React, { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowRight, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Lazy load modals for better initial page load
const InvitationCodeModal = dynamic(
  () => import('./InvitationCodeModal').then((mod) => ({ default: mod.InvitationCodeModal })),
  { ssr: false }
);

const RequestAccessModal = dynamic(
  () => import('./RequestAccessModal').then((mod) => ({ default: mod.RequestAccessModal })),
  { ssr: false }
);

export function LandingCTAs() {
  const [invitationModalOpen, setInvitationModalOpen] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);

  return (
    <>
      <Button
        icon={<Lightbulb />}
        variant="primary"
        onClick={() => setInvitationModalOpen(true)}
        className="w-full sm:w-auto"
      >
        Enter Invitation Code
      </Button>
      
      <Button
        iconEnd={<ArrowRight />}
        onClick={() => setRequestModalOpen(true)}
        data-request-access
        variant="outline"
        className="w-full sm:w-auto"
      >
        Request Access
      </Button>

      <Suspense fallback={null}>
        <InvitationCodeModal open={invitationModalOpen} onOpenChange={setInvitationModalOpen} />
      </Suspense>
      
      <Suspense fallback={null}>
        <RequestAccessModal open={requestModalOpen} onOpenChange={setRequestModalOpen} />
      </Suspense>
    </>
  );
}

