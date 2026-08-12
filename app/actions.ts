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
import { THEME_COOKIE_NAME, type ThemeMode } from "@/lib/theme";
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from "@/lib/sidebarPreference";
import { runSyncCycle } from "@/lib/sync";
import { readSettings, writeSettings } from "@/lib/settings";
import { sendManualConsentRequest, type ManualConsentResult } from "@/lib/notifications";
import { manualTurnOff, manualTurnOn, manualDelete, type ManualActionResult } from "@/lib/manualActions";
import { testSlackConnection, type SlackConnectionTestResult } from "@/lib/slack";
import { getOrganization, listProjects, CapellaApiError } from "@/lib/capellaClient";
import { getSlackBotStatus, reconnectSlackBot, type SlackBotStatus } from "@/lib/slackBot";
import { getClusterHistory, type HistoryTimelineEntry } from "@/lib/historyView";
import type { NotifiableAgeStatus, NotificationsByTier, OrgConfig } from "@/types";

const NOTIFIABLE_TIERS: NotifiableAgeStatus[] = ["Stale", "Forgotten"];

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

/** "system" clears the cookie rather than storing it - absence of the cookie already means system, and OS preference can change after the cookie was set. */
export async function setThemeAction(mode: ThemeMode): Promise<void> {
  const cookieStore = await cookies();
  if (mode === "system") {
    cookieStore.delete(THEME_COOKIE_NAME);
    return;
  }
  cookieStore.set(THEME_COOKIE_NAME, mode, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Persists the sidebar collapse/expand preference - see AppShell's `initialCollapsed` comment for why this is cookie-backed rather than localStorage. */
export async function setSidebarCollapsedAction(collapsed: boolean): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SIDEBAR_COLLAPSED_COOKIE_NAME, String(collapsed), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export interface RefreshResult {
  ok: boolean;
  message: string;
}

export async function refreshAction(): Promise<RefreshResult> {
  try {
    const result = await runSyncCycle();
    revalidatePath("/");
    const removedNote =
      result.removedClusterIds.length > 0
        ? `, ${result.removedClusterIds.length} no longer on Capella and removed`
        : "";
    const failedNote =
      result.failedOrgIds.length > 0 ? `, ${result.failedOrgIds.length} org(s) failed and were skipped` : "";
    return {
      ok: true,
      message: `Synced ${result.syncedClusters} cluster(s) across ${result.orgsSynced} org(s)${removedNote}${failedNote}`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Sync failed for an unknown reason",
    };
  }
}

const INT_SETTINGS_FIELDS = [
  "activityGraceHours",
  "forgottenHours",
  "syncIntervalHours",
  "retentionDays",
] as const;

/** Shared by every simple-scalar settings section (thresholds, sync/retention) - each form only submits its own fields. */
export async function saveSettingsAction(formData: FormData): Promise<void> {
  // Which sidebar section submitted this - carried through the redirect so
  // the settings page can land back on it (these sections share this one
  // action/param pair, so the params alone can't tell them apart).
  const section = String(formData.get("section") ?? "thresholds");

  const partial: Record<string, unknown> = {};
  for (const name of INT_SETTINGS_FIELDS) {
    if (formData.has(name)) partial[name] = Number.parseInt(String(formData.get(name)), 10);
  }
  // Checkboxes submit only when checked, so absence must be read explicitly
  // as "off" rather than left out of `partial` - otherwise unchecking would
  // never actually persist, since writeSettings merges onto current settings.
  if (section === "developer") {
    partial.developerTurnOnEnabled = formData.has("developerTurnOnEnabled");
  }

  const result = await writeSettings(partial);
  if (!result.ok) {
    redirect(`/settings?section=${section}&error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/settings");
  revalidatePath("/");
  redirect(`/settings?section=${section}&saved=1`);
}

export interface OrgNameResult {
  ok: boolean;
  name: string;
  error?: string;
}

/** Looks up an organization's real display name from the Capella API - called as the operator types an org ID/API key into the settings form, before either is necessarily saved. */
export async function fetchOrgNameAction(orgId: string, apiKey: string): Promise<OrgNameResult> {
  if (!orgId || !apiKey) return { ok: false, name: "", error: "Organization ID and API key are required." };
  const settings = await readSettings();
  try {
    const org = await getOrganization({ orgId, apiKey }, settings.capellaApiBaseUrl);
    return { ok: true, name: org.name };
  } catch (err) {
    const message = err instanceof CapellaApiError ? err.message : "Couldn't reach Capella.";
    return { ok: false, name: "", error: message };
  }
}

export interface OrgProjectSummaryResult {
  ok: boolean;
  summary: string;
  error?: string;
}

/**
 * Summarizes which project(s) an org's API key can see - Capella API keys
 * can be scoped to the whole organization or to a single project, and
 * there's no field that states which; the only signal is how many projects
 * `listProjects` actually returns for that key. Exactly one means a
 * project-scoped key, so its name is shown; more than one means an
 * org-level key that can see the whole org, shown as "All projects" rather
 * than an arbitrary pick from the list.
 */
export async function fetchOrgProjectSummaryAction(orgId: string, apiKey: string): Promise<OrgProjectSummaryResult> {
  if (!orgId || !apiKey) return { ok: false, summary: "", error: "Organization ID and API key are required." };
  const settings = await readSettings();
  try {
    const projects = await listProjects({ orgId, apiKey }, settings.capellaApiBaseUrl);
    if (projects.length === 0) return { ok: false, summary: "", error: "No projects visible to this key." };
    if (projects.length === 1) return { ok: true, summary: projects[0].name };
    return { ok: true, summary: "All projects" };
  } catch (err) {
    const message = err instanceof CapellaApiError ? err.message : "Couldn't reach Capella.";
    return { ok: false, summary: "", error: message };
  }
}

export async function saveOrgsAction(formData: FormData): Promise<void> {
  const orgConfigIds = formData.getAll("orgConfigId").map(String);
  const orgIds = formData.getAll("orgId").map(String);
  const orgNames = formData.getAll("orgName").map(String);
  const projectSummaries = formData.getAll("projectSummary").map(String);
  const apiKeys = formData.getAll("apiKey").map(String);

  const capellaOrgs: OrgConfig[] = orgIds
    .map((rawOrgId, i) => ({
      // The client always sends a real id (OrgsEditor.tsx generates one for
      // every row) - the fallback here only guards a hand-crafted request.
      id: orgConfigIds[i]?.trim() || crypto.randomUUID(),
      orgId: rawOrgId.trim(),
      orgName: orgNames[i]?.trim() || undefined,
      projectSummary: projectSummaries[i]?.trim() || undefined,
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

/**
 * Parses a comma-separated "1, 3, 7" form field into a deduped, ascending
 * list of positive integers - invalid or blank entries are simply dropped
 * rather than rejected here; the authoritative check (result must be
 * non-empty) happens in writeSettings/validateSettings, same as every
 * other setting.
 */
function parseSnoozeDayOptions(raw: string): number[] {
  const values = raw
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

export async function saveNotificationsAction(formData: FormData): Promise<void> {
  const notificationsByTier: NotificationsByTier = Object.fromEntries(
    NOTIFIABLE_TIERS.map((tier) => [
      tier,
      {
        notify: formData.has(`notify_${tier}`),
        askTurnOff: formData.has(`askTurnOff_${tier}`),
        askDelete: formData.has(`askDelete_${tier}`),
        autoTurnOffOnInaction: formData.has(`autoTurnOffOnInaction_${tier}`),
        // Disabled while its checkbox is unchecked (see NotificationsEditor),
        // so a disabled field submits nothing - fall back to 3 (DEFAULT_SETTINGS'
        // value) rather than treating a missing field as 0, since a value only
        // matters once the toggle is on. Number.parseInt (not `||`) so an
        // explicit 0 - "no snoozes tolerated" - isn't mistaken for "missing".
        maxSnoozes: (() => {
          const parsed = Number.parseInt(String(formData.get(`maxSnoozes_${tier}`) ?? ""), 10);
          return Number.isNaN(parsed) ? 3 : parsed;
        })(),
      },
    ]),
  ) as NotificationsByTier;

  const result = await writeSettings({
    notificationsByTier,
    consentReminderMax: Number.parseInt(String(formData.get("consentReminderMax")), 10),
    consentExpiryDays: Number.parseInt(String(formData.get("consentExpiryDays")), 10),
    snoozeDayOptions: parseSnoozeDayOptions(String(formData.get("snoozeDayOptionsCsv") ?? "")),
  });
  if (!result.ok) {
    redirect(`/settings?section=notifications&error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/settings");
  redirect("/settings?section=notifications&saved=1");
}

/**
 * Resolves one of saveSlackCredentialsAction's clearable token fields - a
 * blank submitted value means "leave unchanged" (`undefined`, so the caller
 * omits it from the partial entirely and writeSettings' merge-onto-current
 * leaves it alone) unless `clearFieldName`'s flag is set, in which case it
 * resolves to "" explicitly - matching saveCredentialsAction's
 * `newPassword || settings.dashboardPassword` shape for the equivalent
 * password staleness problem.
 */
function resolveClearableField(formData: FormData, fieldName: string, clearFieldName: string): string | undefined {
  if (formData.get(clearFieldName) === "1") return "";
  const value = String(formData.get(fieldName) ?? "").trim();
  return value ? value : undefined;
}

/** Owns just the two Slack tokens, separate from saveNotificationsAction - see separate-slack-credentials-form design.md. */
export async function saveSlackCredentialsAction(formData: FormData): Promise<void> {
  const partial: Record<string, unknown> = {};

  const botToken = resolveClearableField(formData, "slackBotToken", "clearSlackBotToken");
  if (botToken !== undefined) partial.slackBotToken = botToken;

  const appToken = resolveClearableField(formData, "slackAppToken", "clearSlackAppToken");
  if (appToken !== undefined) partial.slackAppToken = appToken;

  const result = await writeSettings(partial);
  if (!result.ok) {
    redirect(`/settings?section=slack-credentials&error=${encodeURIComponent(result.error)}`);
  }

  revalidatePath("/settings");
  redirect("/settings?section=slack-credentials&saved=1");
}

/** Thin wrapper so the client component can call a proper Server Action - the real logic lives in src/lib/notifications.ts, shared with the automatic tier-transition path. */
export async function sendConsentRequestAction(clusterId: string): Promise<ManualConsentResult> {
  const result = await sendManualConsentRequest(clusterId);
  if (result.ok) revalidatePath("/");
  return result;
}

/** Thin wrapper so the client component can call a proper Server Action - the real logic lives in src/lib/manualActions.ts, deliberately independent of the owner-consent workflow (see manual-cluster-actions spec). */
export async function manualTurnOffAction(clusterId: string): Promise<ManualActionResult> {
  const result = await manualTurnOff(clusterId);
  if (result.ok) revalidatePath("/");
  return result;
}

/** Thin wrapper, same shape as manualTurnOffAction above - only reachable while the developer-options "manual cluster turn-on" toggle is enabled. */
export async function manualTurnOnAction(clusterId: string): Promise<ManualActionResult> {
  const result = await manualTurnOn(clusterId);
  if (result.ok) revalidatePath("/");
  return result;
}

/** Thin wrapper, same shape as manualTurnOffAction above. */
export async function manualDeleteAction(clusterId: string): Promise<ManualActionResult> {
  const result = await manualDelete(clusterId);
  if (result.ok) revalidatePath("/");
  return result;
}

/** Feeds the per-cluster history modal - see app/components/ClusterHistoryButton.tsx. */
export async function getClusterHistoryAction(clusterId: string): Promise<HistoryTimelineEntry[]> {
  return getClusterHistory(clusterId);
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
