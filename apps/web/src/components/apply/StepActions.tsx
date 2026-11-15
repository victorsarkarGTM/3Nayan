'use client';

import { Alert, Button } from '@/components/ui';

export function StepActions({ busy, error, label = 'Save and continue' }: { busy?: boolean; error?: string | null; label?: string }) {
  return (
    <div className="mt-2 flex flex-col gap-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <div>
        <Button type="submit" busy={busy}>
          {label}
        </Button>
      </div>
    </div>
  );
}
