import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export const config = {
  // `login`/`api/login` and every route-style metadata convention below are
  // anchored with (?:/|$) so this only excludes those exact routes (and
  // their subpaths) - without it, a route merely prefixed with one of these
  // (e.g. /loginhistory, /icons) would also bypass auth. `icon`, `apple-icon`,
  // `opengraph-image`, and `twitter-image` are Next's generated metadata
  // routes (app/icon.tsx today; the others aren't used yet, but Next's own
  // docs say to exclude "the metadata files" from this matcher as a group,
  // not one at a time - see node_modules/next/dist/docs/.../metadata/index.md)
  // - crawlers/browsers fetch them unauthenticated, so without this exclusion
  // each one 307s to /login instead of serving the actual image/text/xml.
  // sitemap.xml/robots.txt/manifest.* are plain filenames, like favicon.ico
  // above, so they need no (?:/|$) anchor.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon(?:/|$)|apple-icon(?:/|$)|opengraph-image(?:/|$)|twitter-image(?:/|$)|sitemap.xml|robots.txt|manifest.(?:json|webmanifest)|login(?:/|$)|api/login(?:/|$)).*)",
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

  return NextResponse.next();
}
