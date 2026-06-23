'use client';

import { Button } from '@/components/ui/button';

export default function ColorTestPage() {
  return (
    <div className="min-h-dvh bg-background p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Tailwind 4 Color & Interaction Test</h1>
          <p className="text-muted-foreground">Comprehensive test for colors, hover states, and interactions</p>
        </div>

        {/* Gray Color Palette Test */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Gray Color Palette Test</h2>
          <p className="text-sm text-muted-foreground">Testing if default Tailwind gray colors work properly</p>
          
          {/* Background grays */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Background Grays</h3>
            <div className="grid grid-cols-10 gap-2">
              <div className="p-2 bg-gray-50 border rounded text-center text-gray-900">
                <div className="text-xs font-mono">gray-50</div>
              </div>
              <div className="p-2 bg-gray-100 border rounded text-center text-gray-900 ">
                <div className="text-xs font-mono">gray-100</div>
              </div>
              <div className="p-2 bg-gray-200 border rounded text-center text-gray-900">
                <div className="text-xs font-mono">gray-200</div>
              </div>
              <div className="p-2 bg-gray-300 border rounded text-center text-gray-900">
                <div className="text-xs font-mono">gray-300</div>
              </div>
              <div className="p-2 bg-gray-400 border rounded text-center text-gray-900">
                <div className="text-xs font-mono">gray-400</div>
              </div>
              <div className="p-2 bg-gray-500 border rounded text-center text-white">
                <div className="text-xs font-mono">gray-500</div>
              </div>
              <div className="p-2 bg-gray-600 border rounded text-center text-white">
                <div className="text-xs font-mono">gray-600</div>
              </div>
              <div className="p-2 bg-gray-700 border rounded text-center text-white">
                <div className="text-xs font-mono">gray-700</div>
              </div>
              <div className="p-2 bg-gray-800 border rounded text-center text-white">
                <div className="text-xs font-mono">gray-800</div>
              </div>
              <div className="p-2 bg-gray-900 border rounded text-center text-white">
                <div className="text-xs font-mono">gray-900</div>
              </div>
            </div>
          </div>

          {/* Border grays */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Border Grays</h3>
            <div className="grid grid-cols-10 gap-2">
              <div className="py-2 px-1 bg-card border-2 border-gray-50 rounded text-center">
                <div className="text-xs font-mono">border-gray-50</div>
              </div>
              <div className="py-2 px-1 bg-card border-2 border-gray-100 rounded text-center">
                <div className="text-xs font-mono">border-gray-100</div>
              </div>
              <div className="py-2 px-1 bg-card border-2 border-gray-200 rounded text-center">
                <div className="text-xs font-mono">border-gray-200</div>
              </div>
              <div className="py-2 px-1 bg-card border-2 border-gray-300 rounded text-center">
                <div className="text-xs font-mono">border-gray-300</div>
              </div>
              <div className="py-2 px-1 bg-card border-2 border-gray-400 rounded text-center">
                <div className="text-xs font-mono">border-gray-400</div>
              </div>
              <div className="py-2 px-1 bg-card border-2 border-gray-500 rounded text-center">
                <div className="text-xs font-mono">border-gray-500</div>
              </div>
              <div className="py-2 px-1 bg-card border-2 border-gray-600 rounded text-center">
                <div className="text-xs font-mono">border-gray-600</div>
              </div>
              <div className="py-2 px-1 bg-card border-2 border-gray-700 rounded text-center">
                <div className="text-xs font-mono">border-gray-700</div>
              </div>
              <div className="py-2 px-1 bg-card border-2 border-gray-800 rounded text-center">
                <div className="text-xs font-mono">border-gray-800</div>
              </div>
              <div className="py-2 px-1 bg-card border-2 border-gray-900 rounded text-center">
                <div className="text-xs font-mono">border-gray-900</div>
              </div>
            </div>
          </div>

          {/* Text grays */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Text Grays</h3>
            <div className="grid grid-cols-10 gap-2">
              <div className="p-2 bg-card border rounded text-center">
                <div className="text-xs font-mono text-gray-50">text-gray-50</div>
              </div>
              <div className="p-2 bg-card border rounded text-center">
                <div className="text-xs font-mono text-gray-100">text-gray-100</div>
              </div>
              <div className="p-2 bg-card border rounded text-center">
                <div className="text-xs font-mono text-gray-200">text-gray-200</div>
              </div>
              <div className="p-2 bg-card border rounded text-center">
                <div className="text-xs font-mono text-gray-300">text-gray-300</div>
              </div>
              <div className="p-2 bg-card border rounded text-center">
                <div className="text-xs font-mono text-gray-400">text-gray-400</div>
              </div>
              <div className="p-2 bg-card border rounded text-center">
                <div className="text-xs font-mono text-gray-500">text-gray-500</div>
              </div>
              <div className="p-2 bg-card border rounded text-center">
                <div className="text-xs font-mono text-gray-600">text-gray-600</div>
              </div>
              <div className="p-2 bg-card border rounded text-center">
                <div className="text-xs font-mono text-gray-700">text-gray-700</div>
              </div>
              <div className="p-2 bg-card border rounded text-center">
                <div className="text-xs font-mono text-gray-800">text-gray-800</div>
              </div>
              <div className="p-2 bg-card border rounded text-center">
                <div className="text-xs font-mono text-gray-900">text-gray-900</div>
              </div>
            </div>
          </div>

          {/* Dark mode grays */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Dark Mode Grays (dark:)</h3>
            <div className="grid grid-cols-5 gap-2">
              <div className="p-2 bg-card border-2 border-gray-200 dark:border-gray-700 rounded text-center">
                <div className="text-xs font-mono">dark:border-gray-700</div>
              </div>
              <div className="p-2 bg-card border-2 border-gray-300 dark:border-gray-600 rounded text-center">
                <div className="text-xs font-mono">dark:border-gray-600</div>
              </div>
              <div className="p-2 bg-gray-100 dark:bg-gray-800 border rounded text-center">
                <div className="text-xs font-mono">dark:bg-gray-800</div>
              </div>
              <div className="p-2 bg-card border rounded text-center">
                <div className="text-xs font-mono text-gray-600 dark:text-gray-400">dark:text-gray-400</div>
              </div>
              <div className="p-2 bg-card border rounded text-center">
                <div className="text-xs font-mono text-gray-900 dark:text-gray-200">dark:text-gray-200</div>
              </div>
            </div>
          </div>
        </section>

        {/* Background Colors - Direct */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Background Colors (Direct)</h2>
          <div className="grid grid-cols-6 gap-4">
            <div className="p-2 bg-background border rounded-lg">
              <div className="text-xs font-mono mb-1">bg-background</div>
              <div className="text-xs text-muted-foreground">Should be zinc-100/850</div>
            </div>
            <div className="p-2 bg-card border rounded-lg">
              <div className="text-xs font-mono mb-1">bg-card</div>
              <div className="text-xs text-muted-foreground">Should be white/zinc-800</div>
            </div>
            <div className="p-2 bg-muted border rounded-lg">
              <div className="text-xs font-mono mb-1">bg-muted</div>
              <div className="text-xs text-muted-foreground">Should be zinc-200/750</div>
            </div>
            <div className="p-2 bg-accent border rounded-lg">
              <div className="text-xs font-mono mb-1">bg-accent</div>
              <div className="text-xs">Should be subtle</div>
            </div>
            <div className="p-2 bg-primary text-primary-foreground rounded-lg">
              <div className="text-xs font-mono mb-1">bg-primary</div>
              <div className="text-xs">Should be blue</div>
            </div>
            <div className="p-2 bg-secondary text-secondary-foreground rounded-lg">
              <div className="text-xs font-mono mb-1">bg-secondary</div>
              <div className="text-xs">Should be purple</div>
            </div>
          </div>
        </section>

        {/* Background Colors - Hover States */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Background Colors (Hover States)</h2>
          <div className="grid grid-cols-4 gap-4">
            <div className="p-2 bg-card hover:bg-accent border rounded-lg transition-colors cursor-pointer">
              <div className="text-xs font-mono mb-1">hover:bg-accent</div>
              <div className="text-xs text-muted-foreground">card → accent</div>
            </div>
            <div className="p-2 bg-card hover:bg-muted border rounded-lg transition-colors cursor-pointer">
              <div className="text-xs font-mono mb-1">hover:bg-muted</div>
              <div className="text-xs text-muted-foreground">card → muted</div>
            </div>
            <div className="p-2 bg-muted hover:bg-card border rounded-lg transition-colors cursor-pointer">
              <div className="text-xs font-mono mb-1">hover:bg-card</div>
              <div className="text-xs text-muted-foreground">muted → card</div>
            </div>
            <div className="p-2 bg-background hover:bg-accent border rounded-lg transition-colors cursor-pointer">
              <div className="text-xs font-mono mb-1">hover:bg-accent</div>
              <div className="text-xs text-muted-foreground">background → accent</div>
            </div>
          </div>
        </section>

        {/* Text Colors - Direct */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Text Colors (Direct)</h2>
          <div className="grid grid-cols-6 gap-4">
            <div className="p-2 bg-card border rounded-lg">
              <div className="text-foreground text-sm font-mono mb-1">text-foreground</div>
              <div className="text-xs text-muted-foreground">Main text color</div>
            </div>
            <div className="p-2 bg-card border rounded-lg">
              <div className="text-muted-foreground text-sm font-mono mb-1">text-muted-foreground</div>
              <div className="text-xs text-muted-foreground">Muted text</div>
            </div>
            <div className="p-2 bg-card border rounded-lg">
              <div className="text-primary text-sm font-mono mb-1">text-primary</div>
              <div className="text-xs text-muted-foreground">Should be blue</div>
            </div>
            <div className="p-2 bg-card border rounded-lg">
              <div className="text-secondary text-sm font-mono mb-1">text-secondary</div>
              <div className="text-xs text-muted-foreground">Should be purple</div>
            </div>
            <div className="p-2 bg-card border rounded-lg">
              <div className="text-destructive text-sm font-mono mb-1">text-destructive</div>
              <div className="text-xs text-muted-foreground">Should be red</div>
            </div>
            <div className="p-2 bg-card border rounded-lg">
              <div className="text-success text-sm font-mono mb-1">text-success</div>
              <div className="text-xs text-muted-foreground">Should be green</div>
            </div>
          </div>
        </section>

        {/* Text Colors - Hover States */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Text Colors (Hover States)</h2>
          <div className="grid grid-cols-4 gap-4">
            <div className="p-2 bg-card border rounded-lg">
              <div className="text-foreground hover:text-primary text-sm font-mono cursor-pointer transition-colors">
                hover:text-primary
              </div>
              <div className="text-xs text-muted-foreground">foreground → primary</div>
            </div>
            <div className="p-2 bg-card border rounded-lg">
              <div className="text-foreground hover:text-secondary text-sm font-mono cursor-pointer transition-colors">
                hover:text-secondary
              </div>
              <div className="text-xs text-muted-foreground">foreground → secondary</div>
            </div>
            <div className="p-2 bg-card border rounded-lg">
              <div className="text-foreground hover:text-muted-foreground text-sm font-mono cursor-pointer transition-colors">
                hover:text-muted-foreground
              </div>
              <div className="text-xs text-muted-foreground">foreground → muted</div>
            </div>
            <div className="p-2 bg-card border rounded-lg">
              <div className="text-muted-foreground hover:text-foreground text-sm font-mono cursor-pointer transition-colors">
                hover:text-foreground
              </div>
              <div className="text-xs text-muted-foreground">muted → foreground</div>
            </div>
          </div>
        </section>

        {/* Border Colors */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Border Colors (Direct & Hover)</h2>
          <div className="grid grid-cols-4 gap-4">
            <div className="p-2 bg-card border-2 border-border rounded-lg">
              <div className="text-xs font-mono mb-1">border-border</div>
              <div className="text-xs text-muted-foreground">Default border</div>
            </div>
            <div className="p-2 bg-card border-2 border-input rounded-lg">
              <div className="text-xs font-mono mb-1">border-input</div>
              <div className="text-xs text-muted-foreground">Input border</div>
            </div>
            <div className="p-2 bg-card border-2 border-primary rounded-lg">
              <div className="text-xs font-mono mb-1">border-primary</div>
              <div className="text-xs text-muted-foreground">Primary border</div>
            </div>
            <div className="p-2 bg-card border-2 border-border hover:border-primary rounded-lg transition-colors cursor-pointer">
              <div className="text-xs font-mono mb-1">hover:border-primary</div>
              <div className="text-xs text-muted-foreground">border → primary</div>
            </div>
          </div>
        </section>

        {/* Focus & Ring States */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Focus & Ring States</h2>
          <div className="grid grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="focus:ring-2 focus:ring-ring"
              className="px-4 py-2 bg-card border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
            />
            <input
              type="text"
              placeholder="focus:ring-2 focus:ring-primary"
              className="px-4 py-2 bg-card border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
            />
            <input
              type="text"
              placeholder="focus:border-primary"
              className="px-4 py-2 bg-card border border-input rounded-lg focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        </section>

        {/* Button-like Elements (Menu Items) */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Interactive Elements (Menu/Button Style)</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border rounded-lg p-4 space-y-2">
              <div className="text-sm font-semibold mb-2">Standard Menu Item Pattern</div>
              <div className="px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors">
                hover:bg-accent + hover:text-accent-foreground
              </div>
              <div className="px-3 py-2 rounded-md hover:bg-muted cursor-pointer transition-colors">
                hover:bg-muted
              </div>
              <div className="px-3 py-2 rounded-md hover:bg-primary hover:text-primary-foreground cursor-pointer transition-colors">
                hover:bg-primary + hover:text-primary-foreground
              </div>
            </div>

            <div className="bg-card border rounded-lg p-4 space-y-2">
              <div className="text-sm font-semibold mb-2">Active/Selected States</div>
              <div className="px-3 py-2 rounded-md bg-accent text-accent-foreground">
                bg-accent + text-accent-foreground (active)
              </div>
              <div className="px-3 py-2 rounded-md bg-primary text-primary-foreground">
                bg-primary + text-primary-foreground (active)
              </div>
              <div className="px-3 py-2 rounded-md bg-muted">
                bg-muted (active)
              </div>
            </div>
          </div>
        </section>

        {/* Complex Hover Combinations */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Complex Hover Combinations</h2>
          <div className="grid grid-cols-3 gap-4">
            <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
              Primary Button (opacity hover)
            </button>
            <button className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:opacity-90 transition-opacity">
              Secondary Button (opacity hover)
            </button>
            <button className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors">
              Outlined Button (bg+text hover)
            </button>
          </div>
        </section>

        {/* Custom Hover Variables Test */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Custom Hover Variables (CSS)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div 
              className="p-2 rounded-lg cursor-pointer transition-colors"
              style={{
                backgroundColor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--primary-hover))'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--primary))'}
            >
              <div className="text-xs font-mono">--primary-hover</div>
              <div className="text-xs">Custom var test</div>
            </div>
            <div 
              className="p-2 rounded-lg cursor-pointer transition-colors"
              style={{
                backgroundColor: 'hsl(var(--secondary))',
                color: 'hsl(var(--secondary-foreground))'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--secondary-hover))'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--secondary))'}
            >
              <div className="text-xs font-mono">--secondary-hover</div>
              <div className="text-xs">Custom var test</div>
            </div>
            <div 
              className="p-2 rounded-lg cursor-pointer transition-colors"
              style={{
                backgroundColor: 'hsl(var(--accent))',
                color: 'hsl(var(--accent-foreground))'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--accent-hover))'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--accent))'}
            >
              <div className="text-xs font-mono">--accent-hover</div>
              <div className="text-xs">Custom var test</div>
            </div>
          </div>
        </section>

        {/* Elevation Colors */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Elevation Colors</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--elevation-1))' }}>
              <div className="text-xs font-mono mb-1">elevation-1</div>
              <div className="text-xs text-muted-foreground">Lightest</div>
            </div>
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--elevation-2))' }}>
              <div className="text-xs font-mono mb-1">elevation-2</div>
              <div className="text-xs text-muted-foreground">Medium</div>
            </div>
            <div className="p-2 rounded-lg" style={{ backgroundColor: 'hsl(var(--elevation-3))' }}>
              <div className="text-xs font-mono mb-1">elevation-3</div>
              <div className="text-xs text-muted-foreground">Highest</div>
            </div>
          </div>
        </section>

        {/* Status Colors */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Status Colors</h2>
          <div className="grid grid-cols-4 gap-4">
            <div className="p-2 bg-success text-success-foreground rounded-lg">
              <div className="text-xs font-mono mb-1">success</div>
              <div className="text-xs">Green status</div>
            </div>
            <div className="p-2 bg-warning text-warning-foreground rounded-lg">
              <div className="text-xs font-mono mb-1">warning</div>
              <div className="text-xs">Yellow status</div>
            </div>
            <div className="p-2 bg-destructive text-destructive-foreground rounded-lg">
              <div className="text-xs font-mono mb-1">destructive</div>
              <div className="text-xs">Red status</div>
            </div>
            <div className="p-2 bg-info text-white rounded-lg">
              <div className="text-xs font-mono mb-1">info</div>
              <div className="text-xs">Blue status</div>
            </div>
          </div>
        </section>

        {/* Button Component Tests */}
        <section className="space-y-6 border-t pt-8">
          <h2 className="text-xl font-semibold">Button Component Tests (@/components/ui/button)</h2>
          <p className="text-sm text-muted-foreground">Testing actual Button component with all variants, sizes, and states</p>
          
          {/* All Variants - Default Size */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">All Variants (Default Size)</h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="default">Default</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Hover over each button to test hover states. Expected hover classes documented below.
            </div>
            <div className="bg-card border rounded-lg p-3 text-xs font-mono space-y-1">
              <div><span className="text-primary">default:</span> hover:bg-primary/90</div>
              <div><span className="text-destructive">destructive:</span> hover:bg-destructive/90</div>
              <div><span className="text-secondary">outline:</span> hover:bg-accent hover:text-accent-foreground</div>
              <div><span className="text-secondary">secondary:</span> hover:bg-secondary/80</div>
              <div><span className="text-muted-foreground">ghost:</span> hover:bg-accent hover:text-accent-foreground</div>
              <div><span className="text-primary">link:</span> hover:underline</div>
            </div>
          </div>

          {/* All Sizes - Default Variant */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">All Sizes (Default Variant)</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon">🔍</Button>
            </div>
          </div>

          {/* All Variants with All Sizes - Grid View */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">All Variants × All Sizes (Complete Matrix)</h3>
            <div className="bg-card border rounded-lg p-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Variant ↓ / Size →</th>
                    <th className="py-2 px-2">Small</th>
                    <th className="py-2 px-2">Default</th>
                    <th className="py-2 px-2">Large</th>
                    <th className="py-2 px-2">Icon</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 px-2 font-semibold">Default</td>
                    <td className="py-2 px-2 text-center"><Button variant="default" size="sm">Sm</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="default" size="default">Default</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="default" size="lg">Large</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="default" size="icon">🔍</Button></td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-2 font-semibold">Destructive</td>
                    <td className="py-2 px-2 text-center"><Button variant="destructive" size="sm">Sm</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="destructive" size="default">Default</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="destructive" size="lg">Large</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="destructive" size="icon">❌</Button></td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-2 font-semibold">Outline</td>
                    <td className="py-2 px-2 text-center"><Button variant="outline" size="sm">Sm</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="outline" size="default">Default</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="outline" size="lg">Large</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="outline" size="icon">📝</Button></td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-2 font-semibold">Secondary</td>
                    <td className="py-2 px-2 text-center"><Button variant="secondary" size="sm">Sm</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="secondary" size="default">Default</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="secondary" size="lg">Large</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="secondary" size="icon">⚙️</Button></td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 px-2 font-semibold">Ghost</td>
                    <td className="py-2 px-2 text-center"><Button variant="ghost" size="sm">Sm</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="ghost" size="default">Default</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="ghost" size="lg">Large</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="ghost" size="icon">👻</Button></td>
                  </tr>
                  <tr>
                    <td className="py-2 px-2 font-semibold">Link</td>
                    <td className="py-2 px-2 text-center"><Button variant="link" size="sm">Sm</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="link" size="default">Default</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="link" size="lg">Large</Button></td>
                    <td className="py-2 px-2 text-center"><Button variant="link" size="icon">🔗</Button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Disabled States */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Disabled States (All Variants)</h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="default" disabled>Default Disabled</Button>
              <Button variant="destructive" disabled>Destructive Disabled</Button>
              <Button variant="outline" disabled>Outline Disabled</Button>
              <Button variant="secondary" disabled>Secondary Disabled</Button>
              <Button variant="ghost" disabled>Ghost Disabled</Button>
              <Button variant="link" disabled>Link Disabled</Button>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Disabled buttons should have opacity-50 and no hover effect (disabled:pointer-events-none disabled:opacity-50)
            </div>
          </div>

          {/* Buttons on Different Backgrounds */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Buttons on Different Backgrounds</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-background border rounded-lg space-y-2">
                <div className="text-xs font-mono mb-2">bg-background</div>
                <Button variant="default">Default</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
              </div>
              <div className="p-4 bg-card border rounded-lg space-y-2">
                <div className="text-xs font-mono mb-2">bg-card</div>
                <Button variant="default">Default</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
              </div>
              <div className="p-4 bg-muted border rounded-lg space-y-2">
                <div className="text-xs font-mono mb-2">bg-muted</div>
                <Button variant="default">Default</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
              </div>
            </div>
          </div>

          {/* Focus States */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Focus States (Click/Tab to test)</h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="default">Focus Me (Default)</Button>
              <Button variant="outline">Focus Me (Outline)</Button>
              <Button variant="ghost">Focus Me (Ghost)</Button>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Should show ring-ring on focus (focus-visible:ring-1 focus-visible:ring-ring)
            </div>
          </div>

          {/* Button Groups */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Button Groups (Common Patterns)</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button variant="default">Save</Button>
                <Button variant="outline">Cancel</Button>
              </div>
              <div className="flex gap-2">
                <Button variant="destructive">Delete</Button>
                <Button variant="ghost">Cancel</Button>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary">Edit</Button>
                <Button variant="outline">Duplicate</Button>
                <Button variant="ghost">View</Button>
              </div>
            </div>
          </div>

          {/* Opacity Modifier Test */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Opacity Modifier Tests (Key Issue)</h3>
            <p className="text-xs text-muted-foreground">
              Testing if Tailwind 4 properly supports opacity modifiers (/90, /80) on CSS custom properties
            </p>
            <div className="bg-card border rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="text-xs font-semibold mb-2">Default Variant (hover:bg-primary/90)</div>
                  <Button variant="default">Hover to Test Primary/90</Button>
                  <div className="text-xs font-mono space-y-1 bg-muted p-2 rounded">
                    <div>Expected: bg-primary → bg-primary/90 on hover</div>
                    <div className="text-muted-foreground">Class: hover:bg-primary/90</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="text-xs font-semibold mb-2">Secondary Variant (hover:bg-secondary/80)</div>
                  <Button variant="secondary">Hover to Test Secondary/80</Button>
                  <div className="text-xs font-mono space-y-1 bg-muted p-2 rounded">
                    <div>Expected: bg-secondary → bg-secondary/80 on hover</div>
                    <div className="text-muted-foreground">Class: hover:bg-secondary/80</div>
                  </div>
                </div>
              </div>
              <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded text-xs">
                <div className="font-semibold mb-1">🔍 Debugging Hint:</div>
                <div className="text-muted-foreground">
                  If hover doesn't work, the issue is likely that Tailwind 4 isn't generating opacity modifiers for custom CSS variables. 
                  Check if classes like `bg-primary/90` and `bg-secondary/80` exist in compiled CSS.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Debug Info */}
        <section className="space-y-4 border-t pt-8">
          <h2 className="text-xl font-semibold">Debug Information</h2>
          <div className="bg-card border rounded-lg p-4 font-mono text-xs space-y-1">
            <div>Tailwind Version: 4.x (using @import)</div>
            <div>Theme System: CSS Variables (HSL)</div>
            <div>Dark Mode: Class-based (.dark)</div>
            <div className="pt-2 text-muted-foreground">
              ⚠️ If hover states don't work, the issue is likely with Tailwind 4 not generating utilities for custom CSS variables
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

