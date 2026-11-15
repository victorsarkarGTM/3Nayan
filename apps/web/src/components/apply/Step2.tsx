'use client';

import { useState, type FormEvent } from 'react';
import { Card, Field, TextInput } from '@/components/ui';
import { fieldErrors } from '@/lib/errors';
import { StepActions } from './StepActions';
import type { StepProps } from './Wizard';

type Addr = { addressFull: string; city: string; pincode: string; lat: string; lng: string };

export function Step2({ ctx, onContinue }: StepProps) {
  const init = (ctx.app?.snapshot?.step2 ?? {}) as { offersOnline?: boolean; offersInPerson?: boolean; inPerson?: Partial<Record<keyof Addr, string | number>> };
  const [online, setOnline] = useState(init.offersOnline ?? false);
  const [inPerson, setInPerson] = useState(init.offersInPerson ?? false);
  const [addr, setAddr] = useState<Addr>({
    addressFull: String(init.inPerson?.addressFull ?? ''),
    city: String(init.inPerson?.city ?? ''),
    pincode: String(init.inPerson?.pincode ?? ''),
    lat: init.inPerson?.lat !== undefined ? String(init.inPerson.lat) : '',
    lng: init.inPerson?.lng !== undefined ? String(init.inPerson.lng) : '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toData = (o: boolean, p: boolean, a: Addr) => ({
    offersOnline: o,
    offersInPerson: p,
    ...(p ? { inPerson: { ...a, lat: a.lat === '' ? undefined : Number(a.lat), lng: a.lng === '' ? undefined : Number(a.lng) } } : {}),
  });
  const save = (o: boolean, p: boolean, a: Addr) => {
    setErrors({});
    ctx.saveDraft(2, toData(o, p, a));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ctx.saveFull(2, toData(online, inPerson, addr));
      onContinue();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError('Some details need another look.');
    } finally {
      setBusy(false);
    }
  }

  const addrField = (key: keyof Addr, label: string, hint?: string) => (
    <Field label={label} hint={hint} error={errors[`inPerson.${key}`]}>
      {(id, d) => (
        <TextInput id={id} aria-describedby={d} value={addr[key]} invalid={!!errors[`inPerson.${key}`]}
          onChange={(e) => {
            const a = { ...addr, [key]: e.target.value };
            setAddr(a);
            save(online, inPerson, a);
          }} />
      )}
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-muted">Choose how you’ll offer sessions. You can offer both.</p>
        {errors.offersOnline && <p role="alert" className="text-xs font-medium text-danger">{errors.offersOnline}</p>}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={online} onChange={(e) => (setOnline(e.target.checked), save(e.target.checked, inPerson, addr))} />
          Online sessions
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={inPerson} onChange={(e) => (setInPerson(e.target.checked), save(online, e.target.checked, addr))} />
          In-person sessions at my location
        </label>
      </Card>
      {inPerson && (
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-muted">Your full address is shared only with seekers who have a confirmed booking.</p>
          {addrField('addressFull', 'Full address')}
          <div className="grid gap-4 sm:grid-cols-2">
            {addrField('city', 'City')}
            {addrField('pincode', 'PIN code')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {addrField('lat', 'Map latitude', 'From Google Maps, e.g. 18.5204')}
            {addrField('lng', 'Map longitude', 'e.g. 73.8567')}
          </div>
        </Card>
      )}
      <StepActions busy={busy} error={error} />
    </form>
  );
}
