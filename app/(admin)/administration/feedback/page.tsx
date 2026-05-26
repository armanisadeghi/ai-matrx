import React, { Suspense } from 'react';
import FeedbackManagementContainer from './components/FeedbackManagementContainer';

export const metadata = {
    title: 'Feedback Management | AI Matrx Admin',
    description: 'Manage user feedback and bug reports',
};

export default function FeedbackManagementPage() {
    return (
        <div className="h-full w-full overflow-auto">
            <Suspense>
                <FeedbackManagementContainer />
            </Suspense>
        </div>
    );
}

