import { notFound } from 'next/navigation';
import { WorkflowSystemProvider } from '@/features/workflows/react-flow/core/WorkflowSystemProvider';
import { fetchWorkflowById } from '@/features/workflows/service/workflowService';

interface WorkflowPageProps {
    params: Promise<{ id: string }>;
}

export default async function WorkflowPage({ params }: WorkflowPageProps) {
    const resolvedParams = await params;
    const id = resolvedParams.id;
    
    // Check if workflow exists - this would need to be implemented in your service
    // For now, we'll let the client handle the validation
    // In a real app, you might want to validate the UUID format here
    
    if (!id || id.length < 10) {
        notFound();
    }
    
    return (
        <div className="h-dvh">
            <WorkflowSystemProvider
                workflowId={id}
                mode="edit"
            />
        </div>
    );
}
