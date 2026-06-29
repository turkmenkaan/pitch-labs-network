import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionEmail, roleForEmail } from "@/lib/session";

// OAuth callback: Supabase redirects here with a `code` after Slack login.
// We exchange it for a session, then route to the right workspace based on
// whether the signed-in email is an advisor, a founder, or neither.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const email = await getSessionEmail();
      const role = email ? await roleForEmail(email) : null;
      if (role === "advisor") return NextResponse.redirect(`${origin}/`);
      if (role === "founder") return NextResponse.redirect(`${origin}/founder`);
      return NextResponse.redirect(`${origin}/no-access`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
