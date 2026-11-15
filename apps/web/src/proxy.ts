import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/legal'];

/**
 * Session refresh + routing: signed-out users go to /login; staff accounts are signed out (they use
 * the admin panel); signed-in users without a name or current Terms/Privacy consent go to /onboarding.
 */
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
  const redirect = (to: string) => {
    const r = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return isPublic ? response : redirect('/login');

  const { data: staff } = await supabase.from('staff').select('user_id').eq('user_id', user.id).maybeSingle();
  if (staff) {
    await supabase.auth.signOut();
    return path === '/login' ? response : redirect('/login?error=staff');
  }
  if (path.startsWith('/legal')) return response;

  const [{ data: profile }, { data: settings }, { data: consents }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    supabase.from('platform_settings').select('value').eq('key', 'legal_versions').maybeSingle(),
    supabase.from('consents').select('document,version').eq('user_id', user.id),
  ]);
  const versions = (settings?.value ?? {}) as Record<string, string>;
  const consented = ['terms', 'privacy'].every((d) =>
    (consents ?? []).some((c) => c.document === d && c.version === versions[d]),
  );
  const onboarded = Boolean(profile?.full_name) && consented;
  if (!onboarded && path !== '/onboarding') return redirect('/onboarding');
  if (onboarded && (path === '/onboarding' || path === '/login')) return redirect('/home');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
