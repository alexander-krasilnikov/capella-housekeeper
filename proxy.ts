import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export const config = {
  // `login`/`api/login` are anchored with (?:/|$) so this only excludes
  // those exact routes (and their subpaths) - without it, a route merely
  // prefixed with "login" (e.g. /loginhistory) would also bypass auth.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login(?:/|$)|api/login(?:/|$)).*)"],
};

export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
