import { loginAction } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-4 dark:from-slate-950 dark:to-slate-900">
      <form
        action={loginAction}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/40"
      >
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Capella Housekeeper</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in to view cluster status.</p>

        {params.error && (
          <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
            Invalid username or password.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
            Username
            <input
              name="username"
              type="text"
              autoComplete="username"
              required
              autoFocus
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
        </div>

        <button
          type="submit"
          className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 active:bg-blue-700"
        >
          Log in
        </button>
      </form>
    </main>
  );
}
