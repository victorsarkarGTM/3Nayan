'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { Logo } from './ui';

export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const router = useRouter();
  async function signOut() {
    await supabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  }
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Logo />
          <nav className="flex items-center gap-1 text-sm">
            <Link className="rounded-md px-3 py-2 text-ink hover:bg-canvas" href="/home">
              Home
            </Link>
            <Link className="rounded-md px-3 py-2 text-ink hover:bg-canvas" href="/settings">
              Settings
            </Link>
            <button className="rounded-md px-3 py-2 text-muted hover:bg-canvas" onClick={signOut}>
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className={`mx-auto px-4 py-8 ${wide ? 'max-w-4xl' : 'max-w-2xl'}`}>{children}</main>
    </div>
  );
}
