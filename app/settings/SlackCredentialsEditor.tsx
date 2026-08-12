"use client";

import { useRef, useState, useTransition } from "react";
import { saveSlackCredentialsAction, testSlackConnectionAction } from "../actions";
import type { SlackConnectionTestResult } from "@/lib/slack";

const inputClass =
  "w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

/**
 * `clearName`'s hidden input always wins over whatever the visible field
 * holds - see separate-slack-credentials-form design.md Decision 3. A blank
 * visible field on its own means "leave unchanged", not "clear", so
 * clearing needs its own explicit, discoverable control.
 */
function MaskedTokenField({
  name,
  clearName,
  label,
  hint,
  defaultValue,
}: {
  name: string;
  clearName: string;
  label: string;
  hint: string;
  defaultValue: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [revealed, setRevealed] = useState(defaultValue === "");
  const [cleared, setCleared] = useState(false);

  function toggleClear() {
    setCleared((prev) => {
      const next = !prev;
      if (inputRef.current) inputRef.current.value = next ? "" : defaultValue;
      return next;
    });
  }

  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">
      {label}
      <div className="flex gap-1.5">
        <input
          ref={inputRef}
          name={name}
          type={revealed ? "text" : "password"}
          defaultValue={defaultValue}
          disabled={cleared}
          className={inputClass}
          placeholder={label}
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="shrink-0 rounded-lg border border-line px-2 text-xs text-ink-muted hover:bg-panel-hover"
        >
          {revealed ? "Hide" : "Show"}
        </button>
        <button
          type="button"
          onClick={toggleClear}
          className="shrink-0 rounded-lg border border-line px-2 text-xs text-ink-muted hover:bg-panel-hover"
        >
          {cleared ? "Undo" : "Clear"}
        </button>
      </div>
      <input type="hidden" name={clearName} value={cleared ? "1" : "0"} />
      <span className="text-xs font-normal text-ink-faint">
        {cleared
          ? "Will be cleared when you save."
          : `${hint} Leave blank to keep the current value - use "Clear" to remove it.`}
      </span>
    </label>
  );
}

export default function SlackCredentialsEditor({
  slackBotToken,
  slackAppToken,
}: {
  slackBotToken: string;
  slackAppToken: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [testing, startTest] = useTransition();
  const [testResult, setTestResult] = useState<SlackConnectionTestResult | null>(null);

  function runTest() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const botToken = String(data.get("slackBotToken") ?? "");
    const appToken = String(data.get("slackAppToken") ?? "");
    setTestResult(null);
    startTest(async () => {
      setTestResult(await testSlackConnectionAction(botToken, appToken));
    });
  }

  return (
    <form
      ref={formRef}
      action={saveSlackCredentialsAction}
      className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-6"
    >
      <MaskedTokenField
        name="slackBotToken"
        clearName="clearSlackBotToken"
        label="Slack bot token"
        hint="Needs chat:write, users:read.email (to look up owners), and im:write (to open the DM). Used to send DMs."
        defaultValue={slackBotToken}
      />
      <MaskedTokenField
        name="slackAppToken"
        clearName="clearSlackAppToken"
        label="Slack app-level token"
        hint="Needs connections:write. Used for Socket Mode, to receive button clicks - no inbound endpoint required."
        defaultValue={slackAppToken}
      />

      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          disabled={testing}
          onClick={runTest}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted transition hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
        <span className="text-xs font-normal text-ink-faint">
          Tests the tokens currently in the two fields above, even if unsaved - checks the token itself, chat:write +
          im:write (by sending a real message to the bot's own DM), users:read.email, and the app-level token's
          connections:write.
        </span>
        {testResult && (
          <ul className="flex w-full flex-col gap-1 rounded-lg border border-line p-3 text-xs">
            {testResult.checks.map((check) => (
              <li
                key={check.label}
                className={`flex items-start gap-1.5 ${
                  check.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                }`}
              >
                <span>{check.ok ? "✓" : "✗"}</span>
                <span>
                  <span className="font-medium">{check.label}:</span> {check.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="submit"
        className="mt-2 w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-hover active:bg-brand-active"
      >
        Save
      </button>
    </form>
  );
}
