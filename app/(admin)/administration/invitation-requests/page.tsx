"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle,
  XCircle,
  Eye,
  Search,
  RefreshCw,
  Mail,
  Building2,
  User,
  Calendar,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { idMatchesQuery } from "@/utils/search-scoring";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";

const PAGE_LOCATION =
  "AI Matrx Admin — Invitation Requests (/administration/invitation-requests)";

interface InvitationRequest {
  id: string;
  full_name: string;
  email: string;
  company: string;
  use_case: string;
  user_type: string;
  user_type_other?: string;
  phone?: string;
  biggest_obstacle?: string;
  referral_source?: string;
  current_ai_systems?: string;
  recent_project?: string;
  status: "pending" | "approved" | "rejected" | "invited" | "converted";
  step_completed: number;
  notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  invited: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  converted: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

export default function InvitationRequestsPage() {
  const [requests, setRequests] = useState<InvitationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<InvitationRequest | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [totalCount, setTotalCount] = useState(0);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter, limit: "100" });
      const res = await fetch(`/api/admin/invitation-requests?${params}`);
      const data = await res.json();
      if (data.success) {
        setRequests(data.data || []);
        setTotalCount(data.pagination?.total || 0);
      } else {
        toast.error("Failed to load invitation requests");
      }
    } catch {
      toast.error("Failed to load invitation requests");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleAction = async (action: "approve" | "reject") => {
    if (!selectedRequest) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/invitation-requests/${selectedRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes, rejectionReason }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(
          action === "approve"
            ? `Approved! Invitation code sent to ${selectedRequest.email}`
            : `Request rejected. Notification sent to ${selectedRequest.email}`
        );
        setSelectedRequest(null);
        setNotes("");
        setRejectionReason("");
        fetchRequests();
      } else {
        toast.error(data.msg || "Action failed");
      }
    } catch {
      toast.error("Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = requests.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.full_name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.company.toLowerCase().includes(q) ||
      idMatchesQuery(r, q)
    );
  });

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const requestSummary = (r: InvitationRequest) =>
    [
      `Name: ${r.full_name}`,
      `Email: ${r.email}`,
      `Company: ${r.company}`,
      `Type: ${r.user_type === "other" ? r.user_type_other : r.user_type}`,
      `Status: ${r.status}`,
      `Use case: ${r.use_case}`,
      `Submitted: ${new Date(r.created_at).toLocaleString()}`,
    ].join("\n");

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Invitation Requests</h1>
            <p className="text-xs text-muted-foreground">
              {totalCount} total · {pendingCount} pending review
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <CopyButtons
              size="sm"
              label="Invitation requests"
              human={() => filtered.map(requestSummary).join("\n\n")}
              agent={() => ({
                kind: "invitation-requests",
                location: PAGE_LOCATION,
                description:
                  "The invitation requests currently shown (after filter/search).",
                data: filtered,
                attributes: {
                  count: filtered.length,
                  total: totalCount,
                  filter: statusFilter,
                },
              })}
            />
          )}
          <Button variant="ghost" size="sm" onClick={fetchRequests} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/30">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="invited">Invited</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Use Case</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  No requests found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((req) => (
                <TableRow key={req.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">{req.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{req.company}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{req.email}</TableCell>
                  <TableCell className="max-w-[180px]">
                    <span className="truncate block text-sm text-muted-foreground">
                      {req.use_case}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_COLORS[req.status] || "bg-muted text-muted-foreground"
                      }`}
                    >
                      {req.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(req.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <CopyButtons
                        size="icon"
                        label={req.full_name}
                        human={() => requestSummary(req)}
                        agent={() => ({
                          kind: "invitation-request",
                          location: PAGE_LOCATION,
                          description: "A single invitation request.",
                          data: req,
                          summary: requestSummary(req),
                          attributes: { id: req.id, status: req.status },
                        })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setSelectedRequest(req);
                          setNotes(req.notes || "");
                          setRejectionReason("");
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedRequest && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  {selectedRequest.full_name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Status badge */}
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                    STATUS_COLORS[selectedRequest.status] || "bg-muted text-muted-foreground"
                  }`}
                >
                  {selectedRequest.status}
                </span>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-4 pb-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground truncate">{selectedRequest.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">{selectedRequest.company}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground capitalize">
                          {selectedRequest.user_type === "other"
                            ? selectedRequest.user_type_other
                            : selectedRequest.user_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">
                          {new Date(selectedRequest.created_at).toLocaleString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2 pt-4">
                      <CardTitle className="text-sm">Use Case</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                      <p className="text-sm text-muted-foreground">{selectedRequest.use_case}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Optional fields */}
                {(selectedRequest.biggest_obstacle || selectedRequest.current_ai_systems || selectedRequest.recent_project || selectedRequest.referral_source) && (
                  <Card>
                    <CardHeader className="pb-2 pt-4">
                      <CardTitle className="text-sm">Additional Information</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4 space-y-3">
                      {selectedRequest.biggest_obstacle && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Biggest Obstacle</p>
                          <p className="text-sm">{selectedRequest.biggest_obstacle}</p>
                        </div>
                      )}
                      {selectedRequest.current_ai_systems && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Current AI Systems</p>
                          <p className="text-sm">{selectedRequest.current_ai_systems}</p>
                        </div>
                      )}
                      {selectedRequest.recent_project && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Recent Project</p>
                          <p className="text-sm">{selectedRequest.recent_project}</p>
                        </div>
                      )}
                      {selectedRequest.referral_source && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">How they found us</p>
                          <p className="text-sm">{selectedRequest.referral_source}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Admin notes */}
                {selectedRequest.status === "pending" && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Admin Notes (optional)</label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Internal notes about this request..."
                        className="resize-none"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Rejection Reason (if rejecting)</label>
                      <Textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Reason sent to the applicant if rejected..."
                        className="resize-none"
                        rows={2}
                      />
                    </div>
                  </>
                )}

                {selectedRequest.notes && selectedRequest.status !== "pending" && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Admin Notes</p>
                    <p className="text-sm text-muted-foreground">{selectedRequest.notes}</p>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:justify-between">
                <CopyButtons
                  size="sm"
                  label={selectedRequest.full_name}
                  human={() => requestSummary(selectedRequest)}
                  agent={() => ({
                    kind: "invitation-request",
                    location: PAGE_LOCATION,
                    description: "The invitation request open in the detail dialog.",
                    data: selectedRequest,
                    summary: requestSummary(selectedRequest),
                    attributes: {
                      id: selectedRequest.id,
                      status: selectedRequest.status,
                    },
                  })}
                />
                <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setSelectedRequest(null)}>
                  Close
                </Button>
                {selectedRequest.status === "pending" && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => handleAction("reject")}
                      disabled={actionLoading}
                    >
                      <XCircle className="w-4 h-4 mr-1.5" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => handleAction("approve")}
                      disabled={actionLoading}
                    >
                      <CheckCircle className="w-4 h-4 mr-1.5" />
                      Approve & Send Code
                    </Button>
                  </>
                )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
