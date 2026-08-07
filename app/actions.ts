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
import { sendManualConsentRequest, type ManualConsentResult } from "@/lib/notifications";
import { testSlackConnection, type SlackConnectionTestResult } from "@/lib/slack";
import { getSlackBotStatus, reconnectSlackBot, type SlackBotStatus } from "@/lib/slackBot";
import type { NotifiableAgeStatus, NotificationsByTier, OrgConfig } from "@/types";

const NOTIFIABLE_TIERS: NotifiableAgeStatus[] = ["Established", "Stale", "Forgotten"];

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

export async function saveNotificationsAction(formData: FormData): Promise<void> {
  const notificationsByTier: NotificationsByTier = Object.fromEntries(
    NOTIFIABLE_TIERS.map((tier) => [
      tier,
      {
        notify: formData.has(`notify_${tier}`),
        askTurnOff: formData.has(`askTurnOff_${tier}`),
        askDelete: formData.has(`askDelete_${tier}`),
      },
    ]),
  ) as NotificationsByTier;

  const result = await writeSettings({
    slackBotToken: String(formData.get("slackBotToken") ?? ""),
    slackAppToken: String(formData.get("slackAppToken") ?? ""),
    notificationsByTier,
    consentReminderMax: Number.parseInt(String(formData.get("consentReminderMax")), 10),
    consentExpiryDays: Number.parseInt(String(formData.get("consentExpiryDays")), 10),
  });
  if (!result.ok) {
    redirect(`/settings?section=notifications&error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/settings");
  redirect("/settings?section=notifications&saved=1");
}

/** Thin wrapper so the client component can call a proper Server Action - the real logic lives in src/lib/notifications.ts, shared with the automatic tier-transition path. */
export async function sendConsentRequestAction(clusterId: string): Promise<ManualConsentResult> {
  const result = await sendManualConsentRequest(clusterId);
  if (result.ok) revalidatePath("/");
  return result;
}

/** Polled by the client-side connection LED - see app/components/SlackConnectionIndicator.tsx. */
export async function getSlackBotStatusAction(): Promise<SlackBotStatus> {
  return getSlackBotStatus();
}

/** Manually forces the Socket Mode connection to close and reopen - an escape hatch alongside the automatic stuck-connection watchdog in slackBot.ts. */
export async function reconnectSlackBotAction(): Promise<SlackBotStatus> {
  await reconnectSlackBot().catch(() => undefined);
  return getSlackBotStatus();
}

/** Tests the tokens currently typed into the settings form (not necessarily saved yet). */
export async function testSlackConnectionAction(
  botToken: string,
  appToken: string,
): Promise<SlackConnectionTestResult> {
  return testSlackConnection(botToken, appToken);
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
