import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { requestOrigin } from "@/utils/auth/request-origin";
import { AccountClosureError, closeAccount, readClosureJournal, readOpenClosure } from "@/features/account-lifecycle/accountClosure";

function failure(error: unknown) {
  const known = error instanceof AccountClosureError;
  const message = known ? error.message : "Account closure could not be completed. Try again.";
  return NextResponse.json({ error: message, ...(known && error.blockers.length ? { blockers: error.blockers } : {}) }, { status: known ? error.status : 500 });
}

/** Reads the current state only; no GET request can close or restore an account. */
export async function GET() {
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return NextResponse.json({ error: "Sign in to view account closure." }, { status: 401 });
    const adminRead = await createAdminClient().auth.admin.getUserById(data.user.id);
    if (adminRead.error || !adminRead.data.user) throw adminRead.error ?? new Error("User not found");
    // Closed or open is the DB record's call; the journal only adds in-progress/failed.
    const open = await readOpenClosure(data.user.id);
    const journal = readClosureJournal(adminRead.data.user.app_metadata);
    return NextResponse.json({ closure: open ? { state: "closed" } : journal && journal.state !== "closed" ? { state: journal.state } : null });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    // getUser intentionally consults Auth: closure must see a recently revoked session.
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.email) return NextResponse.json({ error: "Sign in again before closing your account." }, { status: 401 });
    const adminRead = await createAdminClient().auth.admin.getUserById(data.user.id);
    if (adminRead.error || !adminRead.data.user?.email) throw adminRead.error ?? new AccountClosureError("A verified account email is required.", 409);
    const result = await closeAccount({
      userId: data.user.id,
      email: adminRead.data.user.email,
      metadata: adminRead.data.user.app_metadata,
      origin: requestOrigin(request.headers) ?? request.nextUrl.origin,
    });
    return NextResponse.json({ state: result.journal.state, requestId: result.journal.requestId, alreadyClosed: result.alreadyClosed });
  } catch (error) {
    return failure(error);
  }
}
