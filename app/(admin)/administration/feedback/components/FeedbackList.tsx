'use client';

import React, { useState, useEffect } from 'react';
import { getAllFeedback, updateFeedback, forceCloseFeedback } from '@/actions/feedback.actions';
import { UserFeedback, FeedbackStatus } from '@/types/feedback.types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, User, MapPin, MessageSquare, AlertCircle, PartyPopper, Lightbulb, HelpCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const statusOptions: { value: FeedbackStatus; label: string; color: string }[] = [
    { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    { value: 'awaiting_review', label: 'Awaiting Review', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    { value: 'in_progress', label: 'In Progress', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
    { value: 'resolved', label: 'Resolved', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    { value: 'closed', label: 'Closed', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
    { value: 'wont_fix', label: "Won't Fix", color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
];

const feedbackTypeIcons: Record<string, React.ReactNode> = {
    bug: <AlertCircle className="w-4 h-4" />,
    feature: <PartyPopper className="w-4 h-4" />,
    suggestion: <Lightbulb className="w-4 h-4" />,
    other: <HelpCircle className="w-4 h-4" />,
};

export default function FeedbackList() {
    const [feedback, setFeedback] = useState<UserFeedback[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFeedback, setSelectedFeedback] = useState<UserFeedback | null>(null);
    const [adminNotes, setAdminNotes] = useState('');
    const [filterStatus, setFilterStatus] = useState<FeedbackStatus | 'all'>('all');
    const [filterType, setFilterType] = useState<string>('all');

    useEffect(() => {
        loadFeedback();
    }, []);

    const loadFeedback = async () => {
        setLoading(true);
        const result = await getAllFeedback();
        if (result.success && result.data) {
            setFeedback(result.data);
        }
        setLoading(false);
    };

    const handleStatusChange = async (feedbackId: string, newStatus: FeedbackStatus) => {
        const terminalStatuses: FeedbackStatus[] = ['closed', 'resolved', 'wont_fix'];
        const result = terminalStatuses.includes(newStatus)
            ? await forceCloseFeedback(feedbackId, newStatus as 'closed' | 'resolved' | 'wont_fix')
            : await updateFeedback(feedbackId, { status: newStatus });
        if (result.success) {
            loadFeedback();
            if (selectedFeedback?.id === feedbackId) {
                setSelectedFeedback(result.data || null);
            }
        }
    };

    const handleSaveNotes = async () => {
        if (!selectedFeedback) return;
        
        const result = await updateFeedback(selectedFeedback.id, { admin_notes: adminNotes });
        if (result.success) {
            loadFeedback();
            setSelectedFeedback(result.data || null);
        }
    };

    const filteredFeedback = feedback.filter(item => {
        if (filterStatus !== 'all' && item.status !== filterStatus) return false;
        if (filterType !== 'all' && item.feedback_type !== filterType) return false;
        return true;
    });

    if (loading) {
        return (
            <Card className="p-8 text-center">
                <p className="text-gray-600 dark:text-gray-400">Loading feedback...</p>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Feedback List */}
            <div className="lg:col-span-1 space-y-4">
                {/* Filters */}
                <Card className="p-4 space-y-3">
                    <div>
                        <label className="text-sm font-medium mb-2 block">Status</label>
                        <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as FeedbackStatus | 'all')}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                {statusOptions.map(option => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-2 block">Type</label>
                        <Select value={filterType} onValueChange={setFilterType}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                <SelectItem value="bug">Bug Report</SelectItem>
                                <SelectItem value="feature">Feature Request</SelectItem>
                                <SelectItem value="suggestion">Suggestion</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </Card>

                {/* Feedback Items */}
                <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                    {filteredFeedback.length === 0 ? (
                        <Card className="p-6 text-center">
                            <p className="text-gray-600 dark:text-gray-400">No feedback found</p>
                        </Card>
                    ) : (
                        filteredFeedback.map((item) => {
                            const statusOption = statusOptions.find(s => s.value === item.status);
                            return (
                                <Card
                                    key={item.id}
                                    className={`p-4 cursor-pointer transition-all hover:shadow-md ${
                                        selectedFeedback?.id === item.id ? 'ring-2 ring-blue-500' : ''
                                    }`}
                                    onClick={() => {
                                        setSelectedFeedback(item);
                                        setAdminNotes(item.admin_notes || '');
                                    }}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            {feedbackTypeIcons[item.feedback_type]}
                                            <span className="text-sm font-medium capitalize">
                                                {item.feedback_type}
                                            </span>
                                        </div>
                                        <Badge className={statusOption?.color}>
                                            {statusOption?.label}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                                        {item.description}
                                    </p>
                                    <div className="text-xs text-gray-500 dark:text-gray-500">
                                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                                    </div>
                                </Card>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Feedback Detail */}
            <div className="lg:col-span-2">
                {selectedFeedback ? (
                    <Card className="p-6">
                        <div className="space-y-6">
                            {/* Header */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-semibold">Feedback Details</h3>
                                    <Select
                                        value={selectedFeedback.status}
                                        onValueChange={(value) => handleStatusChange(selectedFeedback.id, value as FeedbackStatus)}
                                    >
                                        <SelectTrigger className="w-[180px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {statusOptions.map(option => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Metadata */}
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                        <User className="w-4 h-4" />
                                        <span>{selectedFeedback.username || 'Anonymous'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                        <Calendar className="w-4 h-4" />
                                        <span>{formatDistanceToNow(new Date(selectedFeedback.created_at), { addSuffix: true })}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                        <MapPin className="w-4 h-4" />
                                        <span className="truncate">{selectedFeedback.route}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                        <MessageSquare className="w-4 h-4" />
                                        <span className="capitalize">{selectedFeedback.feedback_type}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <h4 className="font-medium mb-2">Description</h4>
                                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                        {selectedFeedback.description}
                                    </p>
                                </div>
                            </div>

                            {/* Admin Notes */}
                            <div>
                                <h4 className="font-medium mb-2">Admin Notes</h4>
                                <Textarea
                                    value={adminNotes}
                                    onChange={(e) => setAdminNotes(e.target.value)}
                                    placeholder="Add notes about this feedback..."
                                    className="min-h-[120px]"
                                />
                                <div className="flex justify-end mt-2">
                                    <Button
                                        onClick={handleSaveNotes}
                                        disabled={adminNotes === (selectedFeedback.admin_notes || '')}
                                        size="sm"
                                    >
                                        Save Notes
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </Card>
                ) : (
                    <Card className="p-8 text-center">
                        <p className="text-gray-600 dark:text-gray-400">
                            Select a feedback item to view details
                        </p>
                    </Card>
                )}
            </div>
        </div>
    );
}

