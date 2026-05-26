'use client';

import AppletBuilder from '@/features/applet/builder/modules/applet-builder/AppletBuilder';
import BuilderPageLayout from '../common/BuilderPageLayout';

export default function AppletBuilderPage() {
  return (
    <BuilderPageLayout activeModuleId="applets">
      <AppletBuilder />
    </BuilderPageLayout>
  );
} 