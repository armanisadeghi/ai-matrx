import React from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { Lock, Shield, Zap, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LandingCTAs } from '@/features/landing/components/LandingCTAs';
import { AuthAwareButton } from '@/features/landing/components/AuthAwareButton';

// Enhanced metadata for SEO
export const metadata: Metadata = {
  title: 'AI Matrx - Enterprise AI Platform | By Invitation Only',
  description: 'Join the future of enterprise AI. AI Matrx is an exclusive, invitation-only platform for building sophisticated AI applications without code. Request your invitation today.',
  keywords: [
    'AI Matrx',
    'Enterprise AI',
    'No-Code AI Platform',
    'Invitation Only',
    'Exclusive AI Platform',
    'Business Automation',
    'AI Innovation',
    'Enterprise Software',
  ],
  openGraph: {
    title: 'AI Matrx - Enterprise AI Platform | By Invitation Only',
    description: 'Join the future of enterprise AI. Exclusive, invitation-only access to the most advanced no-code AI platform.',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Server-side rendered landing page
export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <main className="flex-1 relative overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-50 via-white to-zinc-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" />
        </div>
        
        <div className="relative z-10 container mx-auto px-4 py-16 md:py-24 lg:py-32">
          {/* Status Badge */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary">
              <Lock className="h-4 w-4" />
              <span className="text-sm font-medium">Invitation Only</span>
            </div>
          </div>

          {/* Main Headline */}
          <div className="text-center max-w-5xl mx-auto mb-12">
            <h1 className="text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-semibold mb-6 bg-clip-text text-transparent bg-gradient-to-b from-neutral-800 via-neutral-700 to-neutral-700 dark:from-neutral-200 dark:via-white dark:to-white leading-tight">
              The Future of
              <br />
              <span className="relative inline-block mt-2">
                <span className="absolute inset-0 bg-gradient-to-r from-blue-600 via-violet-600 to-purple-600 blur-2xl opacity-30" />
                <span className="relative bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-violet-600 to-purple-600">
                  Enterprise AI
                </span>
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Build sophisticated AI applications without code. Join a select group of innovators 
              shaping the next generation of business intelligence.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <LandingCTAs />
            <AuthAwareButton />
          </div>

          {/* Feature Grid */}
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            <FeatureCard
              icon={<Zap className="h-6 w-6" />}
              title="Lightning Fast"
              description="Deploy AI solutions in hours, not months. No technical expertise required."
            />
            <FeatureCard
              icon={<Shield className="h-6 w-6" />}
              title="Enterprise Grade"
              description="Built for scale with security and compliance at the core."
            />
            <FeatureCard
              icon={<Workflow className="h-6 w-6" />}
              title="No-Code Platform"
              description="Intuitive visual interface. Build complex AI workflows effortlessly."
            />
          </div>

          {/* Browse-the-platform CTA — links to /features (the public
              grid of every shipped module landing). */}
          <div className="mt-16 flex flex-col items-center text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Curious what's inside?
            </p>
            <Link
              href="/features"
              className="inline-flex items-center gap-2 text-base font-medium text-primary hover:underline"
            >
              Browse every module
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        {/* Bottom Gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-zinc-200 dark:border-zinc-800 relative z-10">
        <div className="container mx-auto px-4 text-center">
          <Link 
            href="/privacy-policy" 
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  );
}

// Feature Card Component (SSR)
function FeatureCard({ 
  icon, 
  title, 
  description 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string;
}) {
  return (
    <div className="group relative p-6 rounded-2xl bg-card border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-300 hover:shadow-lg">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
          {icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}
