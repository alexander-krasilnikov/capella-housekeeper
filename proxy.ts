import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken, isUsingDefaultPassword } from "@/lib/auth";

export const config = {
  // `login`/`api/login`/`change-password` and every route-style metadata
  // convention below are anchored with (?:/|$) so this only excludes those
  // exact routes (and their subpaths) - without it, a route merely prefixed
  // with one of these (e.g. /loginhistory, /icons) would also bypass auth.
  // `change-password` must stay excluded from the session check below the
  // same way `login` is, or the redirect there would loop against itself.
  // `icon`, `apple-icon`, `opengraph-image`, and `twitter-image` are Next's
  // generated metadata routes (app/icon.tsx today; the others aren't used
  // yet, but Next's own docs say to exclude "the metadata files" from this
  // matcher as a group, not one at a time - see
  // node_modules/next/dist/docs/.../metadata/index.md) - crawlers/browsers
  // fetch them unauthenticated, so without this exclusion each one 307s to
  // /login instead of serving the actual image/text/xml. sitemap.xml/
  // robots.txt/manifest.* are plain filenames, like favicon.ico above, so
  // they need no (?:/|$) anchor.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon(?:/|$)|apple-icon(?:/|$)|opengraph-image(?:/|$)|twitter-image(?:/|$)|sitemap.xml|robots.txt|manifest.(?:json|webmanifest)|login(?:/|$)|api/login(?:/|$)|change-password(?:/|$)).*)",
  ],
};

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Blocks every route but change-password itself (excluded above) while the
  // dashboard is still on its seeded default password - checked live against
  // current settings on every request, not just at login, so it also catches
  // an already-existing session and an operator resetting the password back
  // to the default later. See dashboard-auth spec "Access is blocked behind
  // a mandatory change while the password is still the default".
  if (await isUsingDefaultPassword()) {
    return NextResponse.redirect(new URL("/change-password", request.url));
  }

  return NextResponse.next();
}
