export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startSyncScheduler } = await import("./src/lib/scheduler");
  const { startReconciliationLoop } = await import("./src/lib/reconciliation");
  const { startSlackBot } = await import("./src/lib/slackBot");
  startSyncScheduler();
  startReconciliationLoop();
  await startSlackBot();
}
