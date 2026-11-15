import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Admin routes need a signed-in, active staff member at MFA level aal2; everything else goes to /login. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  if (request.nextUrl.pathname === '/login') return response;
  const redirect = () => {
    const r = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirect();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') return redirect();
  const { data: staff } = await supabase.from('staff').select('active').eq('user_id', user.id).maybeSingle();
  if (!staff?.active) return redirect();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
