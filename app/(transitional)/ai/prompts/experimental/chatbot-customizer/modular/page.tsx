'use client';

import { AICustomizationPanel } from './base-components';
import { aiCustomizationConfig } from './aiCustomizationConfig';

export default function Page() {
    return (
        <div>
            <AICustomizationPanel config={aiCustomizationConfig} />
        </div>
    );
}
