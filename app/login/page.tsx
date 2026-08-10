import { loginAction } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand/10 via-canvas to-canvas px-4">
      <form
        action={loginAction}
        className="w-full max-w-sm rounded-2xl border border-line bg-panel p-8 shadow-xl shadow-black/5 dark:shadow-black/40"
      >
        <div className="mb-1 h-1.5 w-10 rounded-full bg-brand" />
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Capella <span className="text-brand">Housekeeper</span>
        </h1>
        <p className="mt-1 text-sm text-ink-muted">Sign in to view cluster status.</p>

        {params.error && (
          <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
            Invalid username or password.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">
            Username
            <input
              name="username"
              type="text"
              autoComplete="username"
              required
              autoFocus
              className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
          </label>
        </div>

        <button
          type="submit"
          className="mt-6 w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-hover active:bg-brand-active"
        >
          Log in
        </button>
      </form>
    </main>
  );
}
