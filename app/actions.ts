"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSessionToken, verifyCredentials, SESSION_COOKIE_NAME } from "@/lib/auth";
import { runSyncCycle } from "@/lib/sync";

export async function loginAction(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!verifyCredentials(username, password)) {
    redirect("/login?error=1");
  }

  const token = createSessionToken(username);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

export interface RefreshResult {
  ok: boolean;
  message: string;
}

export async function refreshAction(): Promise<RefreshResult> {
  try {
    const result = await runSyncCycle();
    revalidatePath("/");
    const purgedNote =
      result.purgedClusterIds.length > 0
        ? `, purged ${result.purgedClusterIds.length} expired tombstone(s)`
        : "";
    const failedNote =
      result.failedOrgIds.length > 0 ? `, ${result.failedOrgIds.length} org(s) failed and were skipped` : "";
    return {
      ok: true,
      message: `Synced ${result.syncedClusters} cluster(s) across ${result.orgsSynced} org(s)${purgedNote}${failedNote}`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Sync failed for an unknown reason",
    };
  }
}
