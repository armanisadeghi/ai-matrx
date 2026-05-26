import * as React from "react";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/credenza-modal/credenza";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function AiAssistModal({ isOpen, onClose, defaultTab, message }) {
  return (
    <Credenza open={isOpen} onOpenChange={onClose}>
      <CredenzaContent className="sm:max-w-[1250px]">
        <CredenzaHeader>
          <CredenzaTitle className="text-2xl font-bold">
            Account Settings
          </CredenzaTitle>
          <CredenzaDescription>
            Manage your account settings and set email preferences.
          </CredenzaDescription>
        </CredenzaHeader>
        <Tabs defaultValue={defaultTab || "confused"} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="confused">I'm confused</TabsTrigger>
            <TabsTrigger value="example">Give me an example</TabsTrigger>
            <TabsTrigger value="question">I have a question</TabsTrigger>
            <TabsTrigger value="split">Split into two cards</TabsTrigger>
            <TabsTrigger value="combine">Combine cards</TabsTrigger>
            <TabsTrigger value="compare">Compare Cards</TabsTrigger>
          </TabsList>
          <TabsContent value="confused">
            <CredenzaBody>
              <div className="space-y-4 py-2 pb-4">
                <CredenzaHeader>
                  <CredenzaTitle className="text-2xl font-bold">
                    Account Settings
                  </CredenzaTitle>
                  <CredenzaDescription>
                    Manage your account settings and set email preferences.
                  </CredenzaDescription>
                </CredenzaHeader>
              </div>
            </CredenzaBody>
          </TabsContent>
          <TabsContent value="example">
            <CredenzaBody>
              <div className="space-y-4 py-2 pb-4">
                <div className="space-y-2">
                  <Label htmlFor="current-example">Current password</Label>
                  <Input id="current-example" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-example">New password</Label>
                  <Input id="new-example" type="password" />
                </div>
              </div>
            </CredenzaBody>
          </TabsContent>
          <TabsContent value="question">
            <CredenzaBody>
              <div className="space-y-4 py-2 pb-4">
                <h4 className="text-sm font-medium">
                  Choose what you want to be notified about:
                </h4>
                <div className="grid gap-4">
                  {["Comments", "Mentions", "Follows", "Direct messages"].map(
                    (item) => (
                      <div key={item} className="flex items-center space-x-2">
                        <Switch
                          id={`${item.toLowerCase().replace(" ", "-")}-question`}
                        />
                        <Label
                          htmlFor={`${item.toLowerCase().replace(" ", "-")}-question`}
                        >
                          {item}
                        </Label>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </CredenzaBody>
          </TabsContent>
          <TabsContent value="split">
            <CredenzaBody>
              <div className="space-y-4 py-2 pb-4">
                <div className="space-y-2">
                  <Label htmlFor="name-split">Name</Label>
                  <Input id="name-split" placeholder="Enter your name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-split">Email</Label>
                  <Input
                    id="email-split"
                    placeholder="Enter your email"
                    type="email"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="marketing-split" />
                  <Label htmlFor="marketing-split">
                    Receive marketing emails
                  </Label>
                </div>
              </div>
            </CredenzaBody>
          </TabsContent>
          <TabsContent value="combine">
            <CredenzaBody>
              <div className="space-y-4 py-2 pb-4">
                <div className="space-y-2">
                  <Label htmlFor="current-combine">Current password</Label>
                  <Input id="current-combine" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-combine">New password</Label>
                  <Input id="new-combine" type="password" />
                </div>
              </div>
            </CredenzaBody>
          </TabsContent>
          <TabsContent value="compare">
            <CredenzaBody>
              <div className="space-y-4 py-2 pb-4">
                <h4 className="text-sm font-medium">
                  Choose what you want to be notified about:
                </h4>
                <div className="grid gap-4">
                  {["Comments", "Mentions", "Follows", "Direct messages"].map(
                    (item) => (
                      <div key={item} className="flex items-center space-x-2">
                        <Switch
                          id={`${item.toLowerCase().replace(" ", "-")}-compare`}
                        />
                        <Label
                          htmlFor={`${item.toLowerCase().replace(" ", "-")}-compare`}
                        >
                          {item}
                        </Label>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </CredenzaBody>
          </TabsContent>
        </Tabs>
        <CredenzaFooter className="flex justify-between">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onClose}>Save changes</Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}

export default AiAssistModal;
