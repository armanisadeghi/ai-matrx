'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import FloatingSheet from '@/components/official/FloatingSheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function FloatingSheetDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;

  // State for different sheet examples
  const [rightSheet, setRightSheet] = useState(false);
  const [leftSheet, setLeftSheet] = useState(false);
  const [topSheet, setTopSheet] = useState(false);
  const [bottomSheet, setBottomSheet] = useState(false);
  const [centerModal, setCenterModal] = useState(false);
  const [mobileSheet, setMobileSheet] = useState(false);
  const [customSheet, setCustomSheet] = useState(false);
  
  // Example code with all available props
  const code = `import FloatingSheet from '@/components/official/FloatingSheet';

// Basic Usage - Right Side Sheet
<FloatingSheet
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Sheet Title"                           // String or ReactNode
  description="Optional description"            // String or ReactNode
  position="right"                              // "right" | "left" | "top" | "bottom" | "center"
  width="md"                                    // "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "full"
  height="auto"                                 // "auto" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "full"
  spacing="0"                                   // "0" to "8" (controls spacing from edges)
  rounded="2xl"                                 // "none" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "full"
  showCloseButton={true}                        // Default: true
  closeOnBackdropClick={true}                   // Default: true
  closeOnEsc={true}                             // Default: true - Close on ESC key
  hasBackdrop={true}                            // Default: true
  lockScroll={true}                             // Default: true - Lock body scroll
  initialFocus={true}                           // Default: true - Auto focus sheet
  preserveScrollPosition={true}                 // Default: true
  animationDuration={300}                       // Default: 300ms
  className=""                                  // Additional sheet classes
  contentClassName=""                           // Additional content classes
  headerClassName=""                            // Additional header classes
  footerClassName=""                            // Additional footer classes
  backdropClassName=""                          // Additional backdrop classes
  headerContent={<CustomHeaderButtons />}       // Additional header content
  footer={<CustomFooter />}                     // Footer content
  footerContent={<AlternativeFooter />}         // Alternative footer prop
  closeButton={<CustomCloseIcon />}             // Custom close button
  role="dialog"                                 // Default: "dialog" - ARIA role
  onBackdropClick={() => console.log('backdrop')} // Custom backdrop handler
  isMobile={false}                              // Default: false - Mobile mode
>
  <div className="p-4">
    Your content here
  </div>
</FloatingSheet>

// Center Modal (Dialog Style)
<FloatingSheet
  isOpen={isModalOpen}
  onClose={() => setIsModalOpen(false)}
  position="center"
  width="lg"
  title="Confirmation Dialog"
  footer={
    <div className="flex gap-2 justify-end">
      <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
      <Button onClick={handleConfirm}>Confirm</Button>
    </div>
  }
>
  <div className="p-4">
    <p>Are you sure you want to proceed?</p>
  </div>
</FloatingSheet>

// Mobile Bottom Sheet
<FloatingSheet
  isOpen={isMobileSheetOpen}
  onClose={() => setIsMobileSheetOpen(false)}
  position="bottom"
  isMobile={true}
  title="Mobile Actions"
>
  <div className="space-y-2">
    <Button className="w-full">Action 1</Button>
    <Button className="w-full">Action 2</Button>
  </div>
</FloatingSheet>

// Features:
// ✅ Multiple positions (right, left, top, bottom, center)
// ✅ Customizable width and height
// ✅ Mobile-optimized mode
// ✅ Scroll locking and preservation
// ✅ ESC key support
// ✅ Focus management
// ✅ Customizable animations
// ✅ Header and footer support
// ✅ Backdrop control
// ✅ Fully accessible (ARIA)`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Versatile floating sheet/modal component with multiple positions, mobile support, and extensive customization options. Perfect for side panels, dialogs, and mobile bottom sheets."
    >
      <div className="w-full max-w-3xl space-y-8">
        
        {/* Demo 1: Position Examples */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Position Variants
          </h3>
          <div className="p-4 border rounded-lg bg-white dark:bg-gray-800">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Button onClick={() => setRightSheet(true)} variant="outline">
                Right Sheet
              </Button>
              <Button onClick={() => setLeftSheet(true)} variant="outline">
                Left Sheet
              </Button>
              <Button onClick={() => setTopSheet(true)} variant="outline">
                Top Sheet
              </Button>
              <Button onClick={() => setBottomSheet(true)} variant="outline">
                Bottom Sheet
              </Button>
              <Button onClick={() => setCenterModal(true)} variant="outline">
                Center Modal
              </Button>
            </div>
          </div>
        </div>

        {/* Demo 2: Mobile Mode */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Mobile-Optimized Bottom Sheet
          </h3>
          <div className="p-4 border rounded-lg bg-white dark:bg-gray-800">
            <Button onClick={() => setMobileSheet(true)} variant="outline">
              Open Mobile Sheet
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Demonstrates mobile-friendly bottom sheet with sticky header/footer
            </p>
          </div>
        </div>

        {/* Demo 3: Custom Styling */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            With Custom Header Actions & Footer
          </h3>
          <div className="p-4 border rounded-lg bg-white dark:bg-gray-800">
            <Button onClick={() => setCustomSheet(true)} variant="outline">
              Open Custom Sheet
            </Button>
          </div>
        </div>

        {/* Features showcase */}
        <div className="p-4 border rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Component Features
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700 dark:text-gray-300">
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>5 position options (right, left, top, bottom, center)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Mobile-optimized mode</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Customizable width and height</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Scroll locking & preservation</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>ESC key and backdrop click</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Auto focus management</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Smooth animations</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Header & footer support</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Custom header actions</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Fully accessible (ARIA)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Backdrop control</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>State preservation</span>
            </div>
          </div>
        </div>

        {/* Usage tips */}
        <div className="p-4 border rounded-lg bg-amber-50 dark:bg-amber-950/20">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Usage Tips
          </h3>
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 list-disc list-inside">
            <li>Use <code className="px-1 bg-gray-200 dark:bg-gray-700 rounded">position="center"</code> for modal dialogs</li>
            <li>Use <code className="px-1 bg-gray-200 dark:bg-gray-700 rounded">position="bottom"</code> with <code className="px-1 bg-gray-200 dark:bg-gray-700 rounded">isMobile</code> for mobile sheets</li>
            <li>Set <code className="px-1 bg-gray-200 dark:bg-gray-700 rounded">spacing="0"</code> for edge-to-edge sheets</li>
            <li>Use <code className="px-1 bg-gray-200 dark:bg-gray-700 rounded">headerContent</code> for action buttons in header</li>
            <li>Set <code className="px-1 bg-gray-200 dark:bg-gray-700 rounded">lockScroll</code> to prevent background scrolling</li>
            <li>Component preserves its state even when closed</li>
            <li>Supports custom close buttons via <code className="px-1 bg-gray-200 dark:bg-gray-700 rounded">closeButton</code> prop</li>
            <li>Height is automatically managed for left/right positions</li>
          </ul>
        </div>
      </div>

      {/* Sheet Implementations */}
      <FloatingSheet
        isOpen={rightSheet}
        onClose={() => setRightSheet(false)}
        title="Right Side Sheet"
        description="This sheet slides in from the right"
        position="right"
        width="md"
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This is a right-side sheet. Perfect for navigation menus, filters, or detail views.
          </p>
          <div className="space-y-2">
            <Label htmlFor="example-input">Example Input</Label>
            <Input id="example-input" placeholder="Type something..." />
          </div>
        </div>
      </FloatingSheet>

      <FloatingSheet
        isOpen={leftSheet}
        onClose={() => setLeftSheet(false)}
        title="Left Side Sheet"
        description="This sheet slides in from the left"
        position="left"
        width="md"
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This is a left-side sheet. Great for navigation or settings panels.
          </p>
          <div className="space-y-2">
            <Button className="w-full" variant="outline">Menu Item 1</Button>
            <Button className="w-full" variant="outline">Menu Item 2</Button>
            <Button className="w-full" variant="outline">Menu Item 3</Button>
          </div>
        </div>
      </FloatingSheet>

      <FloatingSheet
        isOpen={topSheet}
        onClose={() => setTopSheet(false)}
        title="Top Sheet"
        position="top"
        height="md"
      >
        <div className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This sheet slides down from the top. Useful for notifications or announcements.
          </p>
        </div>
      </FloatingSheet>

      <FloatingSheet
        isOpen={bottomSheet}
        onClose={() => setBottomSheet(false)}
        title="Bottom Sheet"
        position="bottom"
        height="md"
      >
        <div className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This sheet slides up from the bottom. Great for mobile-style action sheets.
          </p>
        </div>
      </FloatingSheet>

      <FloatingSheet
        isOpen={centerModal}
        onClose={() => setCenterModal(false)}
        title="Center Modal Dialog"
        description="This appears as a centered modal"
        position="center"
        width="lg"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setCenterModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              alert('Confirmed!');
              setCenterModal(false);
            }}>
              Confirm
            </Button>
          </div>
        }
      >
        <div className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Center modals are perfect for dialogs, confirmations, or focused forms.
          </p>
        </div>
      </FloatingSheet>

      <FloatingSheet
        isOpen={mobileSheet}
        onClose={() => setMobileSheet(false)}
        title="Mobile Bottom Sheet"
        description="Optimized for mobile devices"
        position="bottom"
        isMobile={true}
        footer={
          <Button className="w-full" onClick={() => setMobileSheet(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Mobile mode provides a native-feeling bottom sheet with sticky header and footer.
          </p>
          <div className="space-y-2">
            <Button className="w-full" variant="outline">Action 1</Button>
            <Button className="w-full" variant="outline">Action 2</Button>
            <Button className="w-full" variant="outline">Action 3</Button>
          </div>
        </div>
      </FloatingSheet>

      <FloatingSheet
        isOpen={customSheet}
        onClose={() => setCustomSheet(false)}
        title="Custom Sheet"
        position="right"
        width="lg"
        headerContent={
          <div className="flex gap-2">
            <Button size="sm" variant="outline">Save</Button>
            <Button size="sm" variant="ghost">More</Button>
          </div>
        }
        footer={
          <div className="flex gap-2 justify-between">
            <Button variant="outline" onClick={() => setCustomSheet(false)}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button variant="outline">Draft</Button>
              <Button>Publish</Button>
            </div>
          </div>
        }
      >
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This sheet demonstrates custom header actions and a custom footer with multiple buttons.
          </p>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" placeholder="Enter title..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" placeholder="Enter description..." />
            </div>
          </div>
        </div>
      </FloatingSheet>
    </ComponentDisplayWrapper>
  );
}

