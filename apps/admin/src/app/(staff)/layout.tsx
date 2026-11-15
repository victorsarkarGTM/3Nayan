'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { StaffRole } from '@3nayan/shared';
import { Logo } from '@/components/ui';
import { navFor } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import { StaffProvider, type StaffInfo } from '@/lib/useStaff';

export default function StaffLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [submitted, setSubmitted] = useState<number | null>(null);

  useEffect(() => {
    const sb = supabase();
    (async () => {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return router.replace('/login');
      const { data } = await sb.from('staff').select('role,email').eq('user_id', u.user.id).single();
      setStaff({ userId: u.user.id, email: data!.email, role: data!.role as StaffRole });
      const { count } = await sb.from('practitioners').select('id', { count: 'exact', head: true }).eq('status', 'submitted');
      setSubmitted(count ?? 0);
    })();
  }, [router, path]);

  async function signOut() {
    await supabase().auth.signOut();
    router.replace('/login');
  }

  if (!staff) return <p className="p-8 text-sm text-muted">Loading…</p>;
  return (
    <StaffProvider value={staff}>
      <div className="flex min-h-dvh">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface p-4 md:flex">
          <Logo href="/" suffix="Admin" />
          <nav aria-label="Admin" className="mt-6 flex flex-col gap-1">
            {navFor(staff.role).map((n) => (
              <Link key={n.href} href={n.href} aria-current={path.startsWith(n.href) ? 'page' : undefined}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                  path.startsWith(n.href) ? 'bg-primary-soft font-semibold text-primary' : 'text-ink hover:bg-canvas'
                }`}>
                {n.label}
                {n.href === '/applications' && submitted ? (
                  <span aria-label={`${submitted} new`} className="rounded-full bg-primary px-2 text-xs font-semibold text-white">
                    {submitted}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
          <div className="mt-auto border-t border-line pt-4 text-xs text-muted">
            <p className="truncate">{staff.email}</p>
            <p className="capitalize">{staff.role.replace('_', ' ')}</p>
            <button onClick={signOut} className="mt-2 text-primary hover:underline">
              Sign out
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-6 py-8">{children}</main>
      </div>
    </StaffProvider>
  );
}
