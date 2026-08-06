export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startSyncScheduler } = await import("./src/lib/scheduler");
  startSyncScheduler();
}
