'use client';

import AppBuilder from '@/features/applet/builder/modules/app-builder/AppBuilder';
import BuilderPageLayout from '../common/BuilderPageLayout';

export default function AppBuilderPage() {
  return (
    <BuilderPageLayout activeModuleId="apps">
      <AppBuilder />
    </BuilderPageLayout>
  );
} 