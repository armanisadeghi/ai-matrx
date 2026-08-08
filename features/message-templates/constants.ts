import { MessageRole } from './types/message-templates-db';

export const MESSAGE_ROLES: { value: MessageRole; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'user', label: 'User' },
    { value: 'assistant', label: 'Assistant' },
    { value: 'tool', label: 'Tool' }
];

