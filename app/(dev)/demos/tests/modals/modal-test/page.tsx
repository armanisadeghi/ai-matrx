'use client';

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle,
    CredenzaTrigger,
} from "@/components/ui/credenza-modal/credenza"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CreditCard, Mail, MessageSquare, PlusCircle, Settings, User } from "lucide-react"

export default function ModalTest() {
    return (
        <div className="flex items-center justify-center min-h-screen p-4 space-y-4 bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
            <OpenModal />
        </div>
    )
}

function OpenModal() {
    const [isOpen, setIsOpen] = React.useState(false)

    return (
        <Credenza open={isOpen} onOpenChange={setIsOpen}>
            <CredenzaTrigger asChild>
                <Button variant="outline" className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 border border-gray-400 rounded shadow">
                    <PlusCircle className="mr-2 h-4 w-4" /> Open Enhanced Modal
                </Button>
            </CredenzaTrigger>
            <CredenzaContent className="sm:max-w-[425px]">
                <CredenzaHeader>
                    <CredenzaTitle className="text-2xl font-bold">Account Settings</CredenzaTitle>
                    <CredenzaDescription>
                        Manage your account settings and set email preferences.
                    </CredenzaDescription>
                </CredenzaHeader>
                <Tabs defaultValue="general" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="general">General</TabsTrigger>
                        <TabsTrigger value="password">Password</TabsTrigger>
                        <TabsTrigger value="notifications">Notifications</TabsTrigger>
                    </TabsList>
                    <TabsContent value="general">
                        <CredenzaBody>
                            <div className="space-y-4 py-2 pb-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Name</Label>
                                    <Input id="name" placeholder="Enter your name" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input id="email" placeholder="Enter your email" type="email" />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Switch id="marketing" />
                                    <Label htmlFor="marketing">Receive marketing emails</Label>
                                </div>
                            </div>
                        </CredenzaBody>
                    </TabsContent>
                    <TabsContent value="password">
                        <CredenzaBody>
                            <div className="space-y-4 py-2 pb-4">
                                <div className="space-y-2">
                                    <Label htmlFor="current">Current password</Label>
                                    <Input id="current" type="password" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="new">New password</Label>
                                    <Input id="new" type="password" />
                                </div>
                            </div>
                        </CredenzaBody>
                    </TabsContent>
                    <TabsContent value="notifications">
                        <CredenzaBody>
                            <div className="space-y-4 py-2 pb-4">
                                <h4 className="text-sm font-medium">Choose what you want to be notified about:</h4>
                                <div className="grid gap-4">
                                    {["Comments", "Mentions", "Follows", "Direct messages"].map((item) => (
                                        <div key={item} className="flex items-center space-x-2">
                                            <Switch id={item.toLowerCase().replace(" ", "-")} />
                                            <Label htmlFor={item.toLowerCase().replace(" ", "-")}>{item}</Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CredenzaBody>
                    </TabsContent>
                </Tabs>
                <CredenzaFooter className="flex justify-between">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button onClick={() => setIsOpen(false)}>Save changes</Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    )
}
