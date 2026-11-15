'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Native modal dialog (focus trap, Esc to close, focus restore are handled by the browser). */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title} className="m-auto w-full max-w-md rounded-lg p-6 backdrop:bg-ink/40">
      {open && (
        <>
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="mt-4">{children}</div>
        </>
      )}
    </dialog>
  );
}
