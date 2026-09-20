'use client';
import { Toaster } from '@/components/ui/sonner';
import { toast } from '@/lib/toast';
import { diagnosticToastCopy } from '@/lib/toast/diagnostic-copy';
export default function Page() { return <><button onClick={() => { const copy = diagnosticToastCopy('messaging', 'listConversations: canceling statement due to statement timeout'); toast.error(copy.title, { description: copy.description }); }}>Show timeout</button><Toaster /></>; }
