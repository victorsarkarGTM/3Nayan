import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import { notFound } from 'next/navigation';

const DOCS: Record<string, string> = {
  terms: 'Terms of Use',
  privacy: 'Privacy Policy',
  'practitioner-agreement': 'Practitioner Agreement',
};

/** Tiny Markdown subset: #/## headings, - lists, paragraphs. */
function render(md: string) {
  return md
    .split(/\n{2,}/)
    .filter((b) => b.trim() && !b.startsWith('<!--'))
    .map((block, i) => {
      if (block.startsWith('## ')) return <h2 key={i} className="mt-6 text-lg font-semibold">{block.slice(3)}</h2>;
      if (block.startsWith('# ')) return <h1 key={i} className="text-2xl font-semibold">{block.slice(2)}</h1>;
      if (block.startsWith('- '))
        return (
          <ul key={i} className="mt-3 list-disc pl-6 text-sm leading-6">
            {block.split('\n').map((l, j) => <li key={j}>{l.replace(/^- /, '')}</li>)}
          </ul>
        );
      return <p key={i} className="mt-3 text-sm leading-6 text-ink">{block}</p>;
    });
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!DOCS[doc]) notFound();
  const md = await readFile(path.join(process.cwd(), 'content/legal', `${doc}.md`), 'utf8');
  const draft = md.startsWith('<!-- draft -->');
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/home" className="text-sm text-primary">← Back to 3Nayan</Link>
      {draft && (
        <p role="status" className="mt-4 rounded-md bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
          DRAFT — not for production. Final text will be provided by 3Nayan’s legal counsel.
        </p>
      )}
      <article className="mt-6">{render(md)}</article>
    </main>
  );
}
