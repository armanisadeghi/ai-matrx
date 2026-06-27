import React from 'react';
import { Image, Link, LetterText, Radiation, SquareRadical, Eye } from 'lucide-react';

import { MatrxRecordId } from '@/types/records';
import DraggableToolbar, { ToolbarAction } from '../DraggableToolbar';

export interface MessageToolbarProps {
    messageRecordId: MatrxRecordId;
    role: string;
    isCollapsed: boolean;
    onAddMedia: (messageRecordId: MatrxRecordId) => void;
    onLinkBroker: (messageRecordId: MatrxRecordId) => void;
    onDelete: (messageRecordId: MatrxRecordId) => void;
    onSave: (messageRecordId: MatrxRecordId) => void;
    onToggleCollapse: (messageRecordId: MatrxRecordId) => void;
    onShowChips: (messageRecordId: MatrxRecordId) => void;
    onShowEncoded: (messageRecordId: MatrxRecordId) => void;
    onShowNames: (messageRecordId: MatrxRecordId) => void;
    onShowDefaultValue: (messageRecordId: MatrxRecordId) => void;
    onRoleChange: (messageRecordId: MatrxRecordId, newRole: string) => void;
    onDragDrop: (draggedId: MatrxRecordId, targetId: MatrxRecordId) => void;
    debug?: boolean;
    onDebugClick?: (messageRecordId: MatrxRecordId) => void;
}

const MessageToolbar: React.FC<MessageToolbarProps> = ({
    messageRecordId,
    role,
    isCollapsed,
    onAddMedia,
    onLinkBroker,
    onDelete,
    onSave,
    onToggleCollapse,
    onShowChips,
    onShowEncoded,
    onShowNames,
    onShowDefaultValue,
    onRoleChange,
    onDragDrop,
    debug,
    onDebugClick,
}) => {
    const customActions: ToolbarAction[] = [
        {
            label: 'Add Media',
            icon: <Image className="h-4 w-4" />,
            onClick: () => onAddMedia(messageRecordId),
        },
        {
            label: 'Link Broker',
            icon: <Link className="h-4 w-4" />,
            onClick: () => onLinkBroker(messageRecordId),
        },
        {
            label: 'Standard',
            icon: <Radiation className="h-4 w-4" />,
            onClick: () => onShowChips(messageRecordId),
        },
        {
            label: 'Plain Text',
            icon: <LetterText className="h-4 w-4" />,
            onClick: () => onShowEncoded(messageRecordId),
        },
        {
            label: 'Broker Names',
            icon: <SquareRadical className="h-4 w-4" />,
            onClick: () => onShowNames(messageRecordId),
        },
        {
            label: 'Processed',
            icon: <Eye className="h-4 w-4" />,
            onClick: () => onShowDefaultValue(messageRecordId),
        },
    ];

    const roleOptions = ['system', 'user', 'assistant'];

    return (
        <DraggableToolbar
            id={messageRecordId}
            currentLabel={role}
            labelOptions={roleOptions}
            isCollapsed={isCollapsed}
            onLabelChange={(id, newRole) => onRoleChange(id as MatrxRecordId, newRole)}
            onDelete={(id) => onDelete(id as MatrxRecordId)}
            onSave={(id) => onSave(id as MatrxRecordId)}
            onToggleCollapse={(id) => onToggleCollapse(id as MatrxRecordId)}
            onDragDrop={(draggedId, targetId) => 
                onDragDrop(draggedId as MatrxRecordId, targetId as MatrxRecordId)
            }
            actions={customActions}
            debug={debug}
            onDebugClick={(id) => onDebugClick?.(id as MatrxRecordId)}
        />
    );
};

export default MessageToolbar;