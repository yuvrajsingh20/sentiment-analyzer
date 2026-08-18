import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/**
 * Gate everything except the login/signup screens and the auth endpoints.
 *
 * Page requests redirect to /login (carrying `next` so the user lands back
 * where they were); API requests get a 401 JSON body, because a fetch caller
 * following a redirect to an HTML page is a confusing failure mode.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isAuthEndpoint = pathname.startsWith("/api/auth/");
  const isPublicApi = pathname === "/api/status";
  const isPublicPage =
    pathname === "/" || pathname === "/login" || pathname === "/signup";
  if (isAuthEndpoint || isPublicApi || isPublicPage) return NextResponse.next();

  const username = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (username) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Not authenticated." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  /**
   * Everything except Next internals, static assets, and the bundled demo
   * transcripts.
   *
   * `/samples` is deliberately public. They are non-sensitive fixtures shipped
   * in the repo, and the evaluation route fetches them server-side with no
   * cookie — gating them would hand that fetch a login page and quietly
   * "analyse" the HTML.
   */
  matcher: [
    "/((?!_next/static|_next/image|samples/|logo.png|favicon.ico|icon.svg|icon.png|robots.txt).*)",
  ],
};
