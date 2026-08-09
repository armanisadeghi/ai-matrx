'use client';

import React, { useEffect, useState } from 'react';
import { Trash2, Play, Clock, Trophy, CheckCircle, AlertCircle } from 'lucide-react';
import { getUserQuizSessions, deleteQuizSession, type QuizSession } from '@/actions/quiz.actions';
import { confirm as confirmDialog } from '@/components/dialogs/confirm/ConfirmDialogHost';
import { toast } from '@/lib/toast';
import { formatTime } from './quiz-utils';

interface QuizSessionListProps {
  onLoadSession?: (sessionId: string) => void;
  filter?: 'all' | 'completed' | 'in-progress';
}

export const QuizSessionList: React.FC<QuizSessionListProps> = ({ 
  onLoadSession,
  filter = 'all'
}) => {
  const [sessions, setSessions] = useState<QuizSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = async () => {
    setIsLoading(true);
    setError(null);

    const result = await getUserQuizSessions({
      completedOnly: filter === 'completed',
      inProgressOnly: filter === 'in-progress'
    });

    if (result.success && result.data) {
      setSessions(result.data);
    } else {
      setError(result.error || 'Failed to load quiz sessions');
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadSessions();
  }, [filter]);

  const handleDelete = async (sessionId: string) => {
    const ok = await confirmDialog({
      title: 'Delete this quiz?',
      description: 'This removes the quiz session and its results.',
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;

    const result = await deleteQuizSession(sessionId);
    if (result.success) {
      setSessions(sessions.filter(s => s.id !== sessionId));
    } else {
      toast.error(result.error || 'Failed to delete quiz');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-700 rounded-lg">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500 dark:text-gray-400">
        <p className="text-sm">No quiz sessions found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => {
        const state = session.state;
        const totalQuestions = state.randomizedQuestions.length;
        const answeredCount = Object.keys(state.progress.answers).length;
        const score = state.results?.scorePercentage ?? 0;

        return (
          <div
            key={session.id}
            className="bg-textured border-border rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    {session.is_completed ? (
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    )}
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">
                      {session.title || `Quiz ${session.id.substring(0, 8)}`}
                    </h3>
                  </div>
                  {session.category && (
                    <div className="ml-7">
                      <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
                        {session.category}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span>{totalQuestions} questions</span>
                  <span>•</span>
                  <span>
                    {session.is_completed ? 'Completed' : `${answeredCount}/${totalQuestions} answered`}
                  </span>
                  {session.is_completed && state.results && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Trophy className="h-4 w-4" />
                        {score}%
                      </span>
                    </>
                  )}
                </div>

                <div className="text-xs text-gray-500 dark:text-gray-500">
                  {session.is_completed
                    ? `Completed ${new Date(session.completed_at!).toLocaleDateString()}`
                    : `Started ${new Date(session.created_at).toLocaleDateString()}`}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onLoadSession && (
                  <button
                    onClick={() => onLoadSession(session.id)}
                    className="p-2 rounded-md bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-700 transition-all shadow-sm"
                    title={session.is_completed ? 'View results' : 'Resume quiz'}
                  >
                    <Play className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(session.id)}
                  className="p-2 rounded-md bg-red-500 dark:bg-red-600 text-white hover:bg-red-600 dark:hover:bg-red-700 transition-all shadow-sm"
                  title="Delete quiz"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default QuizSessionList;

