'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMyApplication, getMyProfile } from '@3nayan/client';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function HomePage() {
  const [name, setName] = useState<string>('');
  const [applicationStatus, setApplicationStatus] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabase();
    getMyProfile(sb).then((p) => setName(p?.full_name?.split(' ')[0] ?? ''));
    getMyApplication(sb).then((a) => setApplicationStatus(a.practitioner?.status ?? null));
  }, []);

  const practitionerHref = applicationStatus ? '/practitioner/status' : '/practitioner/apply/1';
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">{name ? `Namaste, ${name}` : 'Namaste'}</h1>
      <div className="mt-6 grid gap-4">
        <Card>
          <h2 className="text-lg font-semibold">Booking opens soon</h2>
          <p className="mt-2 text-sm text-muted">
            We’re welcoming verified healers, astrologers and psychics to 3Nayan. You’ll be able to find and book
            sessions here very soon.
          </p>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Share your gift</h2>
          <p className="mt-2 text-sm text-muted">
            Are you a healer, astrologer or psychic? Apply to offer sessions on 3Nayan.
          </p>
          <Link
            href={practitionerHref}
            className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            {applicationStatus ? 'View my application' : 'Become a practitioner'}
          </Link>
        </Card>
      </div>
    </AppShell>
  );
}
