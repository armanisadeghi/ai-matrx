'use client';

import React from 'react';
import {GridLayout, DashboardArea} from '../GridLayout';
import {Button} from '@/components/ui/button';
import {ScrollArea} from '@/components/ui/scroll-area';
import {
    Mail,
    Star,
    ChevronDown,
    Reply,
    Paperclip,
    Image as ImageIcon,
    Download
} from 'lucide-react';
import {createEntitySelectors} from "@/lib/redux/entity/selectors";
import {useAppSelector} from "@/lib/redux/hooks";
import EmailContentFallback from "./helpers/EmailContentFallback";


const EmailContent = () => {
    const selectors = createEntitySelectors('emails');
    const { records: emails = {} } = useAppSelector(selectors.selectCombinedRecordsWithFieldInfo);

    const hasEmails = emails && Object.keys(emails).length > 0;

    if (!hasEmails) {
        return <EmailContentFallback />;
    }

    const email = Object.values(emails)[0];
    const activeEmail = {
        id: email.id || 'Unknown ID',
        sender: email.sender || 'Unknown Sender',
        recipient: email.recipient || 'Unknown Recipient',
        subject: email.subject || '(No Subject)',
        body: email.body || '(No Content)',
        timestamp: email.timestamp
                   ? new Date(email.timestamp as string | number | Date).toLocaleString()
                   : 'Unknown Time',
        isRead: email.isRead ?? false,
    };

    return (
        <ScrollArea className="h-[75dvh]">
            <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Mail className="h-5 w-5"/>
                        </div>
                        <div>
                            <h3 className="font-medium">{activeEmail.sender}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>{activeEmail.recipient}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                    <ChevronDown className="h-3 w-3"/>
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{activeEmail.timestamp}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Star className="h-4 w-4"/>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Reply className="h-4 w-4"/>
                        </Button>
                    </div>
                </div>

                <div className="prose prose-sm max-w-none dark:prose-invert">
                    <p>{activeEmail.body}</p>
                </div>

                <div className="border rounded-lg p-4 bg-muted/30">
                    <h4 className="font-medium mb-2 text-sm">Attachments (2)</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-2 p-2 border rounded-lg bg-background">
                            <ImageIcon className="h-5 w-5 text-muted-foreground"/>
                            <span className="text-sm truncate">image.jpg</span>
                            <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto">
                                <Download className="h-4 w-4"/>
                            </Button>
                        </div>
                        <div className="flex items-center gap-2 p-2 border rounded-lg bg-background">
                            <Paperclip className="h-5 w-5 text-muted-foreground"/>
                            <span className="text-sm truncate">document.pdf</span>
                            <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto">
                                <Download className="h-4 w-4"/>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </ScrollArea>

    );
};

export default EmailContent;
