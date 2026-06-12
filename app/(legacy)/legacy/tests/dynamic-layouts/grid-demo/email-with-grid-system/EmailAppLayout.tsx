// EmailAppLayout.tsx
import React, {useState, useEffect} from 'react';
import {GridContainer, GridItem} from '../../grid-system-12/grid-system';
import {EMAIL_APP_LAYOUTS} from './grid-24-config';
import EmailNav from '../email-app-demo/EmailNav';
import EmailList from '../email-app-demo/EmailList';
import EmailHeader from '../email-app-demo/EmailHeader';
import EmailContent from '../email-app-demo/EmailContent';
import EmailReply from '../email-app-demo/EmailReply';
import QuickActionsPanel from '../email-app-demo/QuickActionsPanel';

interface EmailAppLayoutProps {
    isSidebarCollapsed: boolean;
    setIsSidebarCollapsed: (value: boolean) => void;
    isMobile: boolean;
    activeView: 'list' | 'content';
    setActiveView: (view: 'list' | 'content') => void;
}

export const EmailAppLayout: React.FC<EmailAppLayoutProps> = (
    {
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        isMobile,
        activeView,
        setActiveView,
    }) => {
    const [layout, setLayout] = useState(EMAIL_APP_LAYOUTS);

    // Adjust layout based on sidebar collapse state
    useEffect(() => {
        if (isSidebarCollapsed) {
            // Modify layout when sidebar is collapsed
            setLayout(prev => ({
                ...prev,
                desktopNav: [1, 25, 49, 73, 97, 121, 145, 169, 193, 217, 241, 265], // Single column
                emailList: [2, 3, 4, 5, 6, 26, 27, 28, 29, 30, 50, 51, 52, 53, 54], // Expanded list
            }));
        } else {
            // Reset to default layout
            setLayout(EMAIL_APP_LAYOUTS);
        }
    }, [isSidebarCollapsed]);

    return (
        <GridContainer className="h-dvh" gap={1}>
            {isMobile ? (
                // Mobile Layout
                <>
                    <GridItem area={layout.mobileHeader}>
                        <EmailHeader isMobile/>
                    </GridItem>

                    {/* Conditional Nav Drawer */}
                    {!isSidebarCollapsed && (
                        <GridItem
                            area={layout.mobileNav}
                            className="fixed inset-0 z-50 bg-background"
                        >
                            <EmailNav collapsed={false}/>
                        </GridItem>
                    )}

                    {/* Main Content Area */}
                    <GridItem
                        area={activeView === 'list' ? layout.mobileList : layout.mobileContent}
                    >
                        {activeView === 'list' ? (
                            <EmailList onEmailClick={() => setActiveView('content')}/>
                        ) : (
                             <div className="h-full flex flex-col">
                                 <EmailContent/>
                                 <EmailReply/>
                             </div>
                         )}
                    </GridItem>

                    <GridItem area={layout.mobileQuickActions}>
                        <QuickActionsPanel/>
                    </GridItem>
                </>
            ) : (
                 // Desktop Layout
                 <>
                     <GridItem
                         area={layout.desktopNav}
                         className={`transition-all duration-300 ${
                             isSidebarCollapsed ? 'w-16' : 'w-64'
                         }`}
                     >
                         <EmailNav collapsed={isSidebarCollapsed}/>
                     </GridItem>

                     <GridItem area={layout.emailList}>
                         <EmailList/>
                     </GridItem>

                     <GridItem area={layout.emailContent}>
                         <div className="h-full flex flex-col">
                             <EmailHeader/>
                             <EmailContent/>
                             <EmailReply/>
                         </div>
                     </GridItem>

                     <GridItem area={layout.quickActions}>
                         <QuickActionsPanel/>
                     </GridItem>
                 </>
             )}
        </GridContainer>
    );
};



/* Strict Version
// EmailAppLayout.tsx
export const EmailAppLayout: React.FC<EmailAppLayoutProps> = ({
                                                                  // ... props
                                                              }) => {
    return (
        <GridContainer className="h-dvh w-screen" gap={1}>
            <GridItem area={layout.desktopNav}>
                <GridComponentWrapper>
                    <EmailNav collapsed={isSidebarCollapsed} />
                </GridComponentWrapper>
            </GridItem>

            <GridItem area={layout.emailList}>
                <GridComponentWrapper>
                    <EmailList />
                </GridComponentWrapper>
            </GridItem>

            <GridItem area={layout.emailContent}>
                <GridComponentWrapper>
                    <div className="flex flex-col h-full">
                        <EmailHeader />
                        <EmailContent />
                        <EmailReply />
                    </div>
                </GridComponentWrapper>
            </GridItem>
        </GridContainer>
    );
};
*/
