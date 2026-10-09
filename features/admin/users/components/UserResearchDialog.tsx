"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import type { AdminUserRow } from "../types";
import { saveUserResearch } from "../service/userResearch";
import { CONTACT_STATE_LABELS, RELATIONSHIP_LABELS, OUTREACH_FEATURE_LABELS, feedbackInvitation, type UserResearch, type Relationship, type ContactState } from "../lib/userResearch";

export function UserResearchDialog({ row, ownerId, existing, sharedOrganizations, onClose, onSaved }: {
  row: AdminUserRow; ownerId: string; existing: UserResearch | null; sharedOrganizations: string[];
  onClose: () => void; onSaved: (record: UserResearch) => void;
}) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [category, setCategory] = useState<Relationship>(existing?.category ?? "unknown");
  const [contactState, setContactState] = useState<ContactState>(existing?.contact_state ?? (row.banned ? "hold" : "not_contacted"));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<{ name: string; plan_key: string }[]>([]);
  const savedDraft = existing?.outreach.draft;
  const [plan, setPlan] = useState(typeof savedDraft === "object" && savedDraft !== null && "plan" in savedDraft && typeof savedDraft.plan === "string" ? savedDraft.plan : "");
  const [feature, setFeature] = useState<keyof typeof OUTREACH_FEATURE_LABELS>(typeof savedDraft === "object" && savedDraft !== null && "feature" in savedDraft && typeof savedDraft.feature === "string" && savedDraft.feature in OUTREACH_FEATURE_LABELS ? savedDraft.feature as keyof typeof OUTREACH_FEATURE_LABELS : "general");
  const [draft, setDraft] = useState(typeof savedDraft === "object" && savedDraft !== null && "text" in savedDraft && typeof savedDraft.text === "string" ? savedDraft.text : "");
  useEffect(() => { void (async () => {
    const { data, error } = await supabase.schema("billing").from("plan").select("name, plan_key").eq("active", true).eq("audience", "personal").is("deleted_at", null).order("rank");
    if (error) { toast.error("Could not load plans. Reopen the notes to retry."); return; }
    setPlans((data ?? []).filter(p => p.plan_key !== "free").map(p => ({ name: p.name, plan_key: p.plan_key })));
  })(); }, []);
  async function save() {
    if (!row.party_id) { toast.error("The linked contact needs repair before notes can be saved."); return; }
    setSaving(true);
    try {
      const saved = await saveUserResearch({ ownerId, subjectId: row.id, partyId: row.party_id,
        label: row.display_name ?? row.email ?? row.id, category, notes, contactState, existing, draft: draft ? { text: draft, plan, feature } : null });
      onSaved(saved); toast.success("Personal notes saved"); onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save notes"); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Personal notes · {row.display_name ?? row.email}</DialogTitle></DialogHeader>
      <div className="grid gap-4">
        <p className="text-xs text-muted-foreground">{row.email}</p>
        {sharedOrganizations.length > 0 && <p className="text-sm">Shared organizations: {sharedOrganizations.join(", ")}</p>}
        {row.banned && <p className="text-sm text-amber-600">Account blocked · invitations on hold</p>}
        {!row.party_id && <p className="text-sm text-destructive">Linked contact missing or ambiguous. Repair the identity link.</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>My category</Label><Select value={category} onValueChange={v => setCategory(v as Relationship)}><SelectTrigger aria-label="My category"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Contact status</Label><Select value={contactState} onValueChange={v => setContactState(v as ContactState)}><SelectTrigger aria-label="Contact status"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CONTACT_STATE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="space-y-2"><Label htmlFor="personal-user-notes">My notes</Label><ProTextarea id="personal-user-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Relationship, previous contact, next step…" className="min-h-28" /></div>
        <div className="border-t pt-4 space-y-3">
          <Label>Invitation draft</Label>
          <p className="text-xs text-muted-foreground">Saved with notes · awaiting your approval</p>
          <div className="grid grid-cols-2 gap-3">
            <Select value={plan} onValueChange={setPlan}><SelectTrigger aria-label="Trial plan"><SelectValue placeholder="Choose a trial plan" /></SelectTrigger><SelectContent>{plans.map(p => <SelectItem key={p.plan_key} value={p.plan_key}>{p.name}</SelectItem>)}</SelectContent></Select>
            <Select value={feature} onValueChange={v => setFeature(v as keyof typeof OUTREACH_FEATURE_LABELS)}><SelectTrigger aria-label="Verified feature"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(OUTREACH_FEATURE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label || "General welcome"}</SelectItem>)}</SelectContent></Select>
          </div>
          <Button variant="outline" onClick={() => {
            if (!plan) { toast.error("Choose a trial plan first."); return; }
            const chosenPlan = plans.find(p => p.plan_key === plan);
            if (!chosenPlan) { toast.error("Choose an available plan first."); return; }
            setDraft(feedbackInvitation(row.display_name ?? row.full_name ?? "", chosenPlan.name, feature));
          }}>Draft invitation</Button>
          {draft && <><ProTextarea aria-label="Invitation draft" value={draft} onChange={e => setDraft(e.target.value)} className="min-h-48" /><Button variant="outline" onClick={async () => { if (!(await copyText(draft, "Invitation copied"))) return; }}>Copy draft</Button></>}
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save notes"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
