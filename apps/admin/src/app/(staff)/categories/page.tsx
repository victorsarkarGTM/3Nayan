'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { listCategoriesAdmin, reorderCategories, setCategoryActive, upsertCategory } from '@3nayan/client';
import { Alert, Badge, Button, Card, Field, TextInput } from '@/components/ui';
import { messageFor } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

type Cat = Awaited<ReturnType<typeof listCategoriesAdmin>>[number];
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function CategoriesPage() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [parentId, setParentId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => listCategoriesAdmin(supabase()).then(setCats), []);
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(messageFor(e));
    }
    await load();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!parentId || name.trim().length < 2) return setError('Choose a parent category and enter a name.');
    const siblings = cats.filter((c) => c.parent_id === parentId);
    await run(() => upsertCategory(supabase(), { parentId, name, slug: slugify(name), sortOrder: siblings.length + 1 }));
    setName('');
  }

  function move(list: Cat[], index: number, delta: number) {
    const ids = list.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    return run(() => reorderCategories(supabase(), ids));
  }

  const tops = cats.filter((c) => !c.parent_id);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Categories</h1>
      {error && <Alert tone="danger">{error}</Alert>}
      <Card>
        <form onSubmit={add} className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Parent category
            <select className="rounded-md border border-line bg-surface px-3 py-2 text-sm" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Choose…</option>
              {tops.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <div className="w-64">
            <Field label="Subcategory name">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          </div>
          <Button type="submit">Add subcategory</Button>
        </form>
      </Card>
      {tops.map((top) => {
        const subs = cats.filter((c) => c.parent_id === top.id);
        return (
          <Card key={top.id}>
            <h2 className="font-semibold">{top.name}</h2>
            <ul className="mt-3 flex flex-col divide-y divide-line">
              {subs.map((c, i) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    {c.name} {!c.active && <Badge>Inactive</Badge>}
                  </span>
                  <span className="flex gap-1">
                    <Button variant="ghost" className="!h-8 !px-2" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(subs, i, -1)}>↑</Button>
                    <Button variant="ghost" className="!h-8 !px-2" aria-label={`Move ${c.name} down`} disabled={i === subs.length - 1} onClick={() => move(subs, i, 1)}>↓</Button>
                    <Button variant="secondary" className="!h-8" onClick={() => run(() => setCategoryActive(supabase(), c.id, !c.active))}>
                      {c.active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
