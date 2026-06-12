'use client';

import React, {useState} from 'react';
import {GridLayout, DashboardArea} from '../GridLayout';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';
import {
    Search,
    ChevronLeft,
    ChevronRight,
    Menu,
} from 'lucide-react';
import ResizablePanel from "@/app/(legacy)/legacy/tests/dynamic-layouts/grid-demo/email-app-demo/ResizablePanel";
import QuickActionsPanel from "@/app/(legacy)/legacy/tests/dynamic-layouts/grid-demo/email-app-demo/QuickActionsPanel";
import EmailList from "@/app/(legacy)/legacy/tests/dynamic-layouts/grid-demo/email-app-demo/EmailList";
import EmailNav from "@/app/(legacy)/legacy/tests/dynamic-layouts/grid-demo/email-app-demo/EmailNav";
import EmailHeader from "@/app/(legacy)/legacy/tests/dynamic-layouts/grid-demo/email-app-demo/EmailHeader";
import EmailContent from "@/app/(legacy)/legacy/tests/dynamic-layouts/grid-demo/email-app-demo/EmailContent";
import EmailReply from "@/app/(legacy)/legacy/tests/dynamic-layouts/grid-demo/email-app-demo/EmailReply";


const EmailAppPage = () => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [listWidth, setListWidth] = useState(380);
    const [isMobile, setIsMobile] = useState(false);
    const [activeView, setActiveView] = useState<'list' | 'content'>('list');

    React.useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (isMobile) {
        return (
            <div className="h-dvh flex flex-col">
                {/* Mobile Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    >
                        <Menu className="h-5 w-5"/>
                    </Button>
                    <h1 className="font-semibold">Email</h1>
                    <Button variant="ghost" size="icon">
                        <Search className="h-5 w-5"/>
                    </Button>
                </div>

                {/* Mobile Navigation Drawer */}
                <div className={cn(
                    "fixed inset-0 z-50 bg-background transition-transform",
                    isSidebarCollapsed ? "-translate-x-full" : "translate-x-0"
                )}>
                    <div className="h-full">
                        <EmailNav/>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1">
                    {activeView === 'list' ? (
                        <div className="h-full">
                            <EmailList onEmailClick={() => setActiveView('content')}/>
                        </div>
                    ) : (
                         <div className="h-full">
                             <div className="p-4 border-b">
                                 <Button
                                     variant="ghost"
                                     onClick={() => setActiveView('list')}
                                 >
                                     <ChevronLeft className="h-4 w-4 mr-2"/>
                                     Back
                                 </Button>
                             </div>
                             <div className="flex-1 relative">
                                 <EmailHeader/>
                                 <EmailContent/>
                                 <EmailReply/>
                             </div>
                         </div>
                    )}
                </div>
                <QuickActionsPanel/>
            </div>
        );
    }

    // Desktop layout with resizable panels
    return (
        <div className="h-dvh flex overflow-hidden">
            {/* Collapsible Sidebar */}
            <div className={cn(
                "flex-shrink-0 transition-all duration-300",
                isSidebarCollapsed ? "w-16" : "w-64"
            )}>
                <div className="h-full relative">
                    <EmailNav collapsed={isSidebarCollapsed}/>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10"
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    >
                        {isSidebarCollapsed ? (
                            <ChevronRight className="h-4 w-4"/>
                        ) : (
                             <ChevronLeft className="h-4 w-4"/>
                         )}
                    </Button>
                </div>
            </div>

            {/* Resizable Email List */}


            <ResizablePanel
                defaultSize={380}
                minSize={320}
                maxSize={600}
                onResize={setListWidth}
            >
                <EmailList/>
            </ResizablePanel>

            {/* Email Content */}
            <div className="flex-1 relative"> {/* Email content container */}
                <EmailHeader/>
                <EmailContent/>
                <EmailReply/>
            </div>
            <QuickActionsPanel/>

        </div>
    );
};

export default EmailAppPage;
