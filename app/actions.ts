"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createSessionToken,
  verifyCredentials,
  verifyCurrentPassword,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { runSyncCycle } from "@/lib/sync";
import { readSettings, writeSettings } from "@/lib/settings";
import type { OrgConfig } from "@/types";

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 12,
};

export async function loginAction(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!(await verifyCredentials(username, password))) {
    redirect("/login?error=1");
  }

  const token = await createSessionToken(username);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
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

const INT_SETTINGS_FIELDS = [
  "newDays",
  "staleDays",
  "forgottenDays",
  "inactivityGraceDays",
  "syncIntervalHours",
  "retentionDays",
] as const;
const STRING_SETTINGS_FIELDS = ["capellaApiBaseUrl"] as const;

/** Shared by every simple-scalar settings section (thresholds, sync/retention, API base URL) - each form only submits its own fields. */
export async function saveSettingsAction(formData: FormData): Promise<void> {
  // Which sidebar section submitted this - carried through the redirect so
  // the settings page can land back on it (these three sections share this
  // one action/param pair, so the params alone can't tell them apart).
  const section = String(formData.get("section") ?? "thresholds");

  const partial: Record<string, unknown> = {};
  for (const name of INT_SETTINGS_FIELDS) {
    if (formData.has(name)) partial[name] = Number.parseInt(String(formData.get(name)), 10);
  }
  for (const name of STRING_SETTINGS_FIELDS) {
    if (formData.has(name)) partial[name] = String(formData.get(name));
  }

  const result = await writeSettings(partial);
  if (!result.ok) {
    redirect(`/settings?section=${section}&error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/settings");
  revalidatePath("/");
  redirect(`/settings?section=${section}&saved=1`);
}

export async function saveOrgsAction(formData: FormData): Promise<void> {
  const orgIds = formData.getAll("orgId").map(String);
  const orgNames = formData.getAll("orgName").map(String);
  const apiKeys = formData.getAll("apiKey").map(String);

  const capellaOrgs: OrgConfig[] = orgIds
    .map((rawOrgId, i) => ({
      orgId: rawOrgId.trim(),
      orgName: orgNames[i]?.trim() || undefined,
      apiKey: apiKeys[i]?.trim() ?? "",
    }))
    // Drop rows left fully blank (e.g. an unused "add another" row never filled in).
    .filter((o) => o.orgId.length > 0 || o.apiKey.length > 0);

  const result = await writeSettings({ capellaOrgs });
  if (!result.ok) {
    redirect(`/settings?orgsError=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/settings");
  revalidatePath("/");
  redirect("/settings?orgsSaved=1");
}

export async function saveCredentialsAction(formData: FormData): Promise<void> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newUsername = String(formData.get("newUsername") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!(await verifyCurrentPassword(currentPassword))) {
    redirect(`/settings?credError=${encodeURIComponent("Current password is incorrect.")}`);
  }

  const settings = await readSettings();
  const result = await writeSettings({
    dashboardUsername: newUsername || settings.dashboardUsername,
    dashboardPassword: newPassword || settings.dashboardPassword,
  });
  if (!result.ok) {
    redirect(`/settings?credError=${encodeURIComponent(result.error)}`);
  }

  // Re-sign a fresh cookie under the (possibly new) username so this change
  // doesn't immediately log the operator making it out.
  const token = await createSessionToken(result.settings.dashboardUsername);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);

  revalidatePath("/settings");
  redirect("/settings?credSaved=1");
}

export async function rotateSessionSecretAction(): Promise<void> {
  const newSecret = crypto.randomBytes(32).toString("hex");
  const result = await writeSettings({ sessionSecret: newSecret });
  if (!result.ok) {
    redirect(`/settings?secretError=${encodeURIComponent(result.error)}`);
  }

  // Old signatures can no longer verify against the new secret - every
  // session, including this one, is invalidated. Clear this cookie
  // explicitly rather than waiting for the next request to fail verification.
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
