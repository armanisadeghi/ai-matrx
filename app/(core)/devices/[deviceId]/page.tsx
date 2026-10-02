import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { DeviceConsole } from "@/features/files/devices/console/DeviceConsole";
import { fetchConsoleDevice } from "@/features/files/devices/console/devices-query";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import type { DeviceRow } from "@/features/files/devices/types";

type Params = Promise<{ deviceId: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { deviceId } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims.sub === "string" ? claims.claims.sub : null;
  const device = userId ? await fetchConsoleDevice(supabase, userId, deviceId).catch(() => null) : null;
  return createDynamicRouteMetadata("/devices", {
    title: device?.instance_name?.trim() || "Device",
    description: "Terminal and files on this computer",
    letter: "DV",
  });
}

/**
 * The device row is read on the server (its name and platform paint with the page); the live
 * connection is the client's. A device that is not this person's, or no longer active, gets the
 * access gate — never a page that would dial the relay only to be refused.
 */
export default async function DevicePage({ params }: { params: Params }) {
  const { deviceId } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims.sub === "string" ? claims.claims.sub : null;
  let error: unknown = null;
  let device: DeviceRow | null = null;
  if (userId) {
    try {
      device = await fetchConsoleDevice(supabase, userId, deviceId);
    } catch (e) {
      error = e;
    }
  }
  if (!device || device.is_active === false) {
    return (
      <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
        <AccessGate token="app_instance" id={deviceId} error={error ?? undefined} fallbackHref="/devices" fallbackLabel="Devices" />
      </div>
    );
  }
  return (
    <Suspense>
      <DeviceConsole key={device.id} device={device} />
    </Suspense>
  );
}
