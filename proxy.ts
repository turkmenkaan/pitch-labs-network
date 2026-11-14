import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// In this Next.js version the middleware convention is renamed to `proxy`.
// It refreshes the Supabase auth session on every request (so server-side
// reads see a valid session) and gates the app: unauthenticated visitors are
// sent to /login. This is a first gate only — pages and server actions also
// verify identity via lib/session.ts.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and getUser — it refreshes the
  // session token and writes the updated cookies onto `response`.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicRoute =
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/auth") ||
    // Cron route: it checks its own bearer secret.
    pathname.startsWith("/api/notifications/") ||
    pathname === "/no-access";

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
