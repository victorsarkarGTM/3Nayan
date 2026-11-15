'use client';

import Link from 'next/link';
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export function Button({
  variant = 'primary',
  busy,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' && 'bg-primary text-white hover:bg-primary-hover',
        variant === 'secondary' && 'border border-line bg-surface text-ink hover:bg-canvas',
        variant === 'danger' && 'bg-danger text-white hover:opacity-90',
        variant === 'ghost' && 'text-primary hover:bg-primary-soft',
        className,
      )}
    >
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

type FieldProps = { label: string; hint?: string; error?: string | null; children: (id: string, describedBy?: string) => ReactNode };

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass = (invalid?: boolean) =>
  cx(
    'w-full rounded-md border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted/70',
    invalid ? 'border-danger' : 'border-line focus:border-primary',
  );

export function TextInput({ invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} aria-invalid={invalid || undefined} className={cx(inputClass(invalid), props.className)} />;
}

export function TextArea({ invalid, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...props} aria-invalid={invalid || undefined} className={cx(inputClass(invalid), 'min-h-32', props.className)} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-lg border border-line bg-surface p-6', className)}>{children}</section>;
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx(
        'rounded-md px-4 py-3 text-sm',
        tone === 'info' && 'bg-primary-soft text-ink',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'warning' && 'bg-warning-soft text-warning',
        tone === 'danger' && 'bg-danger-soft text-danger',
      )}
    >
      {children}
    </div>
  );
}

export function Logo() {
  return (
    <Link href="/home" className="text-lg font-bold tracking-tight text-primary">
      3Nayan
    </Link>
  );
}
