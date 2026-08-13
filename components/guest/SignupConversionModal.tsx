'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
    MousePointerClick, 
    Check, 
    Zap, 
    Shield,
    Infinity,
    TrendingUp,
    PartyPopper
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SignupConversionModalProps {
    isOpen: boolean;
    onClose: () => void;
    totalUsed?: number;
}

/**
 * Beautiful conversion modal shown when guest hits 5 execution limit
 * Encourages signup with free trial offer
 */
export function SignupConversionModal({ 
    isOpen, 
    onClose,
    totalUsed = 5 
}: SignupConversionModalProps) {
    const router = useRouter();

    const handleSignup = () => {
        router.push('/signup?source=guest_limit');
    };

    const handleLogin = () => {
        router.push('/login?source=guest_limit');
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <div className="flex items-center justify-center mb-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <MousePointerClick className="w-8 h-8 text-white" />
                        </div>
                    </div>
                    <DialogTitle className="flex items-center justify-center gap-2 text-center text-2xl">
                        You've Experienced the Power of AI Matrx!
                        <PartyPopper className="size-6" aria-hidden="true" />
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Stats */}
                    <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 border-blue-200 dark:border-blue-800">
                        <CardContent className="pt-6">
                            <div className="text-center">
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                    You've completed
                                </p>
                                <p className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                    {totalUsed} Free Runs
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                                    Ready for unlimited access?
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Benefits */}
                    <div>
                        <h3 className="text-lg font-semibold mb-4 text-center">
                            Continue with a Free Account
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                                    <Infinity className="w-5 h-5 text-green-600 dark:text-green-400" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm">Unlimited Access</p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                        Run as many apps as you want
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                                    <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm">Create Your Own</p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                        Build custom AI apps
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center flex-shrink-0">
                                    <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm">Track History</p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                        Save and review your work
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center flex-shrink-0">
                                    <Shield className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm">Priority Support</p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                        Get help when you need it
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Features list */}
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                        <h4 className="font-semibold text-sm mb-3">What's included:</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            {[
                                'Access to all public apps',
                                'Create custom prompt apps',
                                'Advanced AI models',
                                'Save conversation history',
                                'Export and share results',
                                'API access (coming soon)'
                            ].map((feature, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                                    <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* CTAs */}
                    <div className="flex flex-col gap-3">
                        <Button 
                            onClick={handleSignup}
                            size="lg"
                            className="w-full text-base font-semibold"
                        >
                            <MousePointerClick className="w-5 h-5 mr-2" />
                            Create Free Account
                        </Button>
                        
                        <Button 
                            onClick={handleLogin}
                            variant="outline"
                            size="lg"
                            className="w-full"
                        >
                            Already have an account? Log in
                        </Button>

                        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                            No credit card required • Free forever for core features
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
