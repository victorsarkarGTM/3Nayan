'use client';

import { addReviewNote } from '@3nayan/client';
import { formatIST } from '@3nayan/shared';
import { useState, type FormEvent } from 'react';
import { Button, Card, TextArea } from '@/components/ui';
import { messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { Detail } from './Sections';

export function Notes({ d, onAdded }: { d: Detail; onAdded: () => void }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await addReviewNote(supabase(), d.practitioner.id, body);
      setBody('');
      onAdded();
    } catch (err) {
      setError(messageFor(err));
    }
  }
  return (
    <Card>
      <h2 className="mb-1 font-semibold">Internal notes</h2>
      <p className="mb-3 text-xs text-muted">Visible to staff only.</p>
      <form onSubmit={add} className="flex flex-col gap-2">
        <TextArea aria-label="New note" value={body} onChange={(e) => setBody(e.target.value)} className="!min-h-20" />
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <div><Button type="submit" variant="secondary" disabled={!body.trim()}>Add note</Button></div>
      </form>
      <ul className="mt-4 flex flex-col gap-3">
        {d.notes.map((n) => (
          <li key={n.id} className="text-sm">
            <p className="whitespace-pre-wrap">{n.body}</p>
            <p className="text-xs text-muted">{formatIST(new Date(n.created_at))}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
