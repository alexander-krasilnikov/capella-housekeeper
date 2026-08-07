import Link from "next/link";
import { readSettings } from "@/lib/settings";
import { saveSettingsAction, saveCredentialsAction, rotateSessionSecretAction } from "../actions";
import OrgsEditor from "./OrgsEditor";
import NotificationsEditor from "./NotificationsEditor";
import SettingsShell, { type SettingsSection } from "./SettingsShell";

function NumberField({
  name,
  label,
  hint,
  defaultValue,
}: {
  name: string;
  label: string;
  hint: string;
  defaultValue: number;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
      {label}
      <input
        name={name}
        type="number"
        min={1}
        step={1}
        required
        defaultValue={defaultValue}
        className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      <span className="text-xs font-normal text-slate-400 dark:text-slate-500">{hint}</span>
    </label>
  );
}

function Banner({ error, success }: { error?: string; success?: string }) {
  if (error) {
    return (
      <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
        {error}
      </p>
    );
  }
  if (success) {
    return (
      <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
        {success}
      </p>
    );
  }
  return null;
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
    </div>
  );
}

/** Which of the three shared-action sections (if any) a redirect's `section` param names; defaults to "thresholds" if the param is missing or unrecognized. */
function resolveInitialSection(params: {
  section?: string;
  orgsError?: string;
  orgsSaved?: string;
  credError?: string;
  credSaved?: string;
  secretError?: string;
}): string {
  const SHARED_SECTION_IDS = ["thresholds", "sync", "apiUrl", "notifications"];
  if (params.section && SHARED_SECTION_IDS.includes(params.section)) return params.section;
  if (params.orgsError || params.orgsSaved) return "orgs";
  if (params.credError || params.credSaved) return "credentials";
  if (params.secretError) return "secret";
  return "thresholds";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    section?: string;
    error?: string;
    saved?: string;
    orgsError?: string;
    orgsSaved?: string;
    credError?: string;
    credSaved?: string;
    secretError?: string;
  }>;
}) {
  const [settings, params] = await Promise.all([readSettings(), searchParams]);
  const sharedBanner = <Banner error={params.error} success={params.saved ? "Settings saved." : undefined} />;

  const sections: SettingsSection[] = [
    {
      id: "thresholds",
      label: "Age-status thresholds",
      content: (
        <div>
          <SectionHeader
            title="Age-status thresholds"
            description="Controls when a cluster is classified In Use, Stale, or Forgotten."
          />
          {sharedBanner}
          <form
            action={saveSettingsAction}
            className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <input type="hidden" name="section" value="thresholds" />
            <NumberField
              name="activityGraceHours"
              label="Activity grace period (hours)"
              hint="A cluster with real activity within this many hours - or created this recently, if it has no activity yet - is 'In Use'. Must be less than 'Forgotten after'."
              defaultValue={settings.activityGraceHours}
            />
            <NumberField
              name="forgottenHours"
              label="Forgotten after (hours)"
              hint="Older than this with no evidence of use becomes 'Forgotten'; otherwise it's 'Stale'."
              defaultValue={settings.forgottenHours}
            />
            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 active:bg-blue-700"
            >
              Save
            </button>
          </form>
        </div>
      ),
    },
    {
      id: "sync",
      label: "Sync & retention",
      content: (
        <div>
          <SectionHeader
            title="Sync & retention"
            description="How often clusters are polled, and how long deleted clusters are remembered."
          />
          {sharedBanner}
          <form
            action={saveSettingsAction}
            className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <input type="hidden" name="section" value="sync" />
            <NumberField
              name="syncIntervalHours"
              label="Sync interval (hours)"
              hint="How often the dashboard polls Capella for cluster changes."
              defaultValue={settings.syncIntervalHours}
            />
            <NumberField
              name="retentionDays"
              label="Retention period (days)"
              hint="How long a deleted cluster's tombstone and history are kept before being purged."
              defaultValue={settings.retentionDays}
            />
            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 active:bg-blue-700"
            >
              Save
            </button>
          </form>
        </div>
      ),
    },
    {
      id: "apiUrl",
      label: "Capella API base URL",
      content: (
        <div>
          <SectionHeader title="Capella API base URL" />
          {sharedBanner}
          <form
            action={saveSettingsAction}
            className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <input type="hidden" name="section" value="apiUrl" />
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
              API base URL
              <input
                name="capellaApiBaseUrl"
                type="url"
                required
                defaultValue={settings.capellaApiBaseUrl}
                className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                Only change this if Couchbase moves the Capella Management API host.
              </span>
            </label>
            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 active:bg-blue-700"
            >
              Save
            </button>
          </form>
        </div>
      ),
    },
    {
      id: "notifications",
      label: "Slack notifications",
      content: (
        <div>
          <SectionHeader
            title="Slack notifications"
            description="DMs a cluster's derived owner on age-status transitions, with optional turn-off/delete consent buttons."
          />
          {sharedBanner}
          <NotificationsEditor
            slackBotToken={settings.slackBotToken}
            slackAppToken={settings.slackAppToken}
            notificationsByTier={settings.notificationsByTier}
            consentReminderMax={settings.consentReminderMax}
            consentExpiryDays={settings.consentExpiryDays}
          />
        </div>
      ),
    },
    {
      id: "orgs",
      label: "Capella organizations",
      content: (
        <div>
          <SectionHeader
            title="Capella organizations"
            description="Organizations the dashboard polls for clusters. API keys are masked by default."
          />
          <Banner error={params.orgsError} success={params.orgsSaved ? "Organizations saved." : undefined} />
          <OrgsEditor initialOrgs={settings.capellaOrgs} />
        </div>
      ),
    },
    {
      id: "credentials",
      label: "Dashboard credentials",
      content: (
        <div>
          <SectionHeader title="Dashboard credentials" description="Changing these requires your current password." />
          <Banner error={params.credError} success={params.credSaved ? "Credentials updated." : undefined} />
          <form
            action={saveCredentialsAction}
            className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
              New username
              <input
                name="newUsername"
                type="text"
                defaultValue={settings.dashboardUsername}
                autoComplete="username"
                className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
              New password
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Leave blank to keep current password"
                className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
              Current password (required to save)
              <input
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
                className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 active:bg-blue-700"
            >
              Update credentials
            </button>
          </form>
        </div>
      ),
    },
    {
      id: "secret",
      label: "Session secret",
      content: (
        <div>
          <SectionHeader
            title="Session secret"
            description="Signs login sessions. Auto-generated - never shown, only rotated."
          />
          <Banner error={params.secretError} />
          <form
            action={rotateSessionSecretAction}
            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">
              A secret is set. Rotating it will log out every active session, including this one.
            </p>
            <button
              type="submit"
              className="shrink-0 rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
            >
              Rotate
            </button>
          </form>
        </div>
      ),
    },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <header className="mb-6">
        <Link
          href="/"
          className="text-sm text-slate-500 transition hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
        >
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Everything the dashboard needs to run, configurable from here - no environment variables required.
        </p>
      </header>

      <SettingsShell sections={sections} initialActiveId={resolveInitialSection(params)} />
    </main>
  );
}
