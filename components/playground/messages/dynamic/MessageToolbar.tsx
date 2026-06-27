import React from 'react';
import { 
  Image, 
  Link, 
  Expand, 
  Minimize2, 
  LetterText, 
  Radiation, 
  SquareRadical, 
  Eye 
} from 'lucide-react';
import DynamicToolbar from '../../components/dynamic/DynamicToolbar';
import { BaseToolbarProps } from '../../components/dynamic/PanelContent';
import { MatrxRecordId } from '@/types/records';

export interface MessageToolbarProps extends BaseToolbarProps {
    messageRecordId: MatrxRecordId;
    role: string;
    onAddMedia: (messageRecordId: MatrxRecordId) => void;
    onLinkBroker: (messageRecordId: MatrxRecordId) => void;
    onShowChips: (messageRecordId: MatrxRecordId) => void;
    onShowEncoded: (messageRecordId: MatrxRecordId) => void;
    onShowNames: (messageRecordId: MatrxRecordId) => void;
    onShowDefaultValue: (messageRecordId: MatrxRecordId) => void;
    onRoleChange: (messageRecordId: MatrxRecordId, newRole: string) => void;
    debug?: boolean;
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
  debug = false,
  onDebugClick,
}) => {
  // Configure role selector
  const roleSelector = {
    options: [
      { id: 'system', label: 'SYSTEM', value: 'system' },
      { id: 'user', label: 'USER', value: 'user' },
      { id: 'assistant', label: 'ASSISTANT', value: 'assistant' }
    ],
    defaultValue: role,
    onChange: (value: string) => onRoleChange(messageRecordId, value)
  };

  // Configure custom actions
  const customActions = [
    {
      id: 'add-media',
      label: 'Add Media',
      icon: <Image className="h-4 w-4" />,
      onClick: () => onAddMedia(messageRecordId)
    },
    {
      id: 'link-broker',
      label: 'Link Broker',
      icon: <Link className="h-4 w-4" />,
      onClick: () => onLinkBroker(messageRecordId)
    },
    {
      id: 'collapse',
      label: isCollapsed ? 'Expand' : 'Collapse',
      icon: isCollapsed ? <Expand className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />,
      onClick: () => onToggleCollapse()
    },
    {
      id: 'show-chips',
      label: 'Standard',
      icon: <Radiation className="h-4 w-4" />,
      onClick: () => onShowChips(messageRecordId)
    },
    {
      id: 'show-encoded',
      label: 'Plain Text',
      icon: <LetterText className="h-4 w-4" />,
      onClick: () => onShowEncoded(messageRecordId)
    },
    {
      id: 'show-names',
      label: 'Broker Names',
      icon: <SquareRadical className="h-4 w-4" />,
      onClick: () => onShowNames(messageRecordId)
    },
    {
      id: 'show-default',
      label: 'Processed',
      icon: <Eye className="h-4 w-4" />,
      onClick: () => onShowDefaultValue(messageRecordId)
    }
  ];

  return (
    <DynamicToolbar
      id={messageRecordId}
      isCollapsed={isCollapsed}
      selector={roleSelector}
      actions={customActions}
      showSave={true}
      showDelete={true}
      onSave={() => onSave()}
      onDelete={() => onDelete()}
      debug={debug}
      onDebugClick={() => onDebugClick?.()}
      enableDragDrop={true}
      onDragDrop={onDragDrop}
    />
  );
};

export default MessageToolbar;