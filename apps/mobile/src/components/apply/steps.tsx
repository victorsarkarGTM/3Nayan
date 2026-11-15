import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import {
  avatarUrl,
  listMyCertificates,
  removeCertificate,
  startDigilocker,
  submitApplication,
  uploadAvatar,
  uploadPractitionerFile,
  verifyBank,
  verifyPan,
} from '@3nayan/client';
import { AGREEMENT_DECLARATION, KYC_MAX_ATTEMPTS_PER_24H, LIMITS, SESSION_LANGUAGES, type StepNumber } from '@3nayan/shared';
import { Button, Card, Checkbox, Field, Muted, Notice } from '@/components/ui';
import { fieldErrors, messageForError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { color } from '@/theme';
import { Chips } from './Chips';
import type { AppCtx, KycRow } from './useApplication';
import { validatePickedVideo } from './video';

export const STEP_TITLES: Record<StepNumber, string> = {
  1: 'About you', 2: 'Session formats', 3: 'Credentials', 4: 'Video intro', 5: 'Identity and bank', 6: 'Agreement',
};
type Props = { ctx: AppCtx; next: () => void };
/** Draft snapshot values are unvalidated (any step may be half-filled). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;
const toggle = (list: string[], v: string, max?: number) => (list.includes(v) ? list.filter((x) => x !== v) : max && list.length >= max ? list : [...list, v]);

/** Read a picked file's bytes (Supabase Storage uploads of React Native Blobs can arrive empty). */
async function bytesOf(uri: string) {
  return (await fetch(uri)).arrayBuffer();
}

function useSubmit(ctx: AppCtx, step: StepNumber, next: () => void) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(data: unknown) {
    setBusy(true);
    setError(null);
    try {
      await ctx.saveFull(step, data);
      next();
    } catch (e) {
      setErrors(fieldErrors(e));
      setError(Object.keys(fieldErrors(e)).length ? 'Some details need another look.' : messageForError(e));
    } finally {
      setBusy(false);
    }
  }
  return { errors, setErrors, error, setError, busy, submit };
}

export function Step1({ ctx, next }: Props) {
  const init = (ctx.app?.snapshot?.step1 ?? {}) as Loose;
  const [v, setV] = useState({
    displayName: init.displayName ?? '', photoPath: init.photoPath ?? '', bio: init.bio ?? '',
    yearsExperience: init.yearsExperience != null ? String(init.yearsExperience) : '',
    subcategoryIds: (init.subcategoryIds ?? []) as string[], languages: (init.languages ?? []) as string[],
  });
  const { errors, error, busy, submit, setError } = useSubmit(ctx, 1, next);
  const data = (x: typeof v) => ({ ...x, yearsExperience: x.yearsExperience === '' ? undefined : Number(x.yearsExperience) });
  const set = (patch: Partial<typeof v>) => {
    const n = { ...v, ...patch };
    setV(n);
    ctx.saveDraft(1, data(n));
  };
  async function pickPhoto() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    try {
      const body = await bytesOf(a.uri);
      const { path } = await uploadAvatar(supabase, { type: a.mimeType ?? 'image/jpeg', size: body.byteLength } as Blob, { body });
      set({ photoPath: path });
    } catch (e) {
      setError(messageForError(e));
    }
  }
  const photo = avatarUrl(supabase, v.photoPath);
  return (
    <>
      <Card>
        <Field label="Display name" hint="How seekers will see you" error={errors.displayName} maxLength={60} value={v.displayName} onChangeText={(t) => set({ displayName: t })} testID="display-name" />
        {photo && <Image source={{ uri: photo }} accessibilityLabel="Your profile photo" style={{ width: 72, height: 72, borderRadius: 36 }} />}
        <Button label={photo ? 'Change profile photo' : 'Add profile photo'} variant="secondary" onPress={pickPhoto} testID="pick-photo" />
        {errors.photoPath && <Text style={{ color: color.danger, fontSize: 12 }}>{errors.photoPath}</Text>}
        <Field label="About you" hint={`${v.bio.trim().length}/${LIMITS.bioMax} characters (at least ${LIMITS.bioMin})`} error={errors.bio} multiline maxLength={LIMITS.bioMax} value={v.bio} onChangeText={(t) => set({ bio: t })} testID="bio" />
        <Field label="Years of experience" error={errors.yearsExperience} keyboardType="number-pad" value={v.yearsExperience} onChangeText={(t) => set({ yearsExperience: t.replace(/\D/g, '') })} testID="years" />
      </Card>
      <Card>
        <Text style={{ fontWeight: '500' }}>What do you practise? (1 to {LIMITS.subcategoriesMax})</Text>
        {errors.subcategoryIds && <Text style={{ color: color.danger, fontSize: 12 }}>{errors.subcategoryIds}</Text>}
        {ctx.categories.map((c) => (
          <View key={c.id} style={{ gap: 8 }}>
            <Text style={{ fontWeight: '600' }}>{c.name}</Text>
            <Chips options={c.children.map((s) => ({ id: s.id, label: s.name }))} selected={v.subcategoryIds}
              onToggle={(id) => set({ subcategoryIds: toggle(v.subcategoryIds, id, LIMITS.subcategoriesMax) })} />
          </View>
        ))}
      </Card>
      <Card>
        <Text style={{ fontWeight: '500' }}>Languages you offer sessions in</Text>
        {errors.languages && <Text style={{ color: color.danger, fontSize: 12 }}>{errors.languages}</Text>}
        <Chips options={SESSION_LANGUAGES.map((l) => ({ id: l, label: l }))} selected={v.languages} onToggle={(l) => set({ languages: toggle(v.languages, l) })} />
      </Card>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button label="Save and continue" onPress={() => submit(data(v))} busy={busy} testID="save-continue" />
    </>
  );
}

export function Step2({ ctx, next }: Props) {
  const init = (ctx.app?.snapshot?.step2 ?? {}) as Loose;
  const [online, setOnline] = useState<boolean>(init.offersOnline ?? false);
  const [inPerson, setInPerson] = useState<boolean>(init.offersInPerson ?? false);
  const [a, setA] = useState({
    addressFull: init.inPerson?.addressFull ?? '', city: init.inPerson?.city ?? '', pincode: init.inPerson?.pincode ?? '',
    lat: init.inPerson?.lat != null ? String(init.inPerson.lat) : '', lng: init.inPerson?.lng != null ? String(init.inPerson.lng) : '',
  });
  const { errors, error, busy, submit } = useSubmit(ctx, 2, next);
  const data = (o: boolean, p: boolean, x: typeof a) => ({
    offersOnline: o, offersInPerson: p,
    ...(p ? { inPerson: { ...x, lat: x.lat === '' ? undefined : Number(x.lat), lng: x.lng === '' ? undefined : Number(x.lng) } } : {}),
  });
  const save = (o: boolean, p: boolean, x: typeof a) => ctx.saveDraft(2, data(o, p, x));
  const field = (k: keyof typeof a, label: string, extra: object = {}) => (
    <Field label={label} error={errors[`inPerson.${k}`]} value={a[k]} {...extra}
      onChangeText={(t) => { const n = { ...a, [k]: t }; setA(n); save(online, inPerson, n); }} />
  );
  return (
    <>
      <Card>
        {errors.offersOnline && <Text style={{ color: color.danger, fontSize: 12 }}>{errors.offersOnline}</Text>}
        <Checkbox checked={online} onChange={(x) => (setOnline(x), save(x, inPerson, a))} label="Online sessions" />
        <Checkbox checked={inPerson} onChange={(x) => (setInPerson(x), save(online, x, a))} label="In-person sessions at my location" />
      </Card>
      {inPerson && (
        <Card>
          <Muted>Your full address is shared only with seekers who have a confirmed booking.</Muted>
          {field('addressFull', 'Full address')}
          {field('city', 'City')}
          {field('pincode', 'PIN code', { keyboardType: 'number-pad', maxLength: 6 })}
          {field('lat', 'Map latitude', { keyboardType: 'decimal-pad' })}
          {field('lng', 'Map longitude', { keyboardType: 'decimal-pad' })}
        </Card>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <Button label="Save and continue" onPress={() => submit(data(online, inPerson, a))} busy={busy} testID="save-continue" />
    </>
  );
}

export function Step3({ ctx, next }: Props) {
  const init = (ctx.app?.snapshot?.step3 ?? {}) as Loose;
  const [certs, setCerts] = useState<Array<{ id: string; file_name: string }>>([]);
  const [text, setText] = useState<string>(init.credentialsText ?? '');
  const [links, setLinks] = useState<string[]>(init.links?.length ? init.links : ['']);
  const [uploading, setUploading] = useState(false);
  const { errors, error, setError, busy, submit } = useSubmit(ctx, 3, next);
  useEffect(() => { listMyCertificates(supabase).then(setCerts); }, []);
  const data = (c = certs, t = text, l = links) => ({ certificateIds: c.map((x) => x.id), ...(t.trim() ? { credentialsText: t } : {}), links: l.map((x) => x.trim()).filter(Boolean) });

  async function addCertificates() {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], multiple: true, copyToCacheDirectory: true });
    if (r.canceled) return;
    setUploading(true);
    for (const f of r.assets) {
      try {
        const body = await bytesOf(f.uri);
        const { documentId } = await uploadPractitionerFile(supabase, ctx.app!.practitioner!.id, 'certificate',
          { type: f.mimeType ?? 'application/pdf', size: body.byteLength } as Blob, { body, fileName: f.name });
        setCerts((c) => [...c, { id: documentId!, file_name: f.name }]);
      } catch (e) {
        setError(`${f.name}: ${messageForError(e)}`);
      }
    }
    setUploading(false);
  }
  return (
    <>
      <Card>
        <Muted>Optional. PDF, JPG or PNG, up to 10 MB each.</Muted>
        {certs.map((c) => (
          <View key={c.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text>{c.file_name}</Text>
            <Text accessibilityRole="button" accessibilityLabel={`Remove ${c.file_name}`} style={{ color: color.primary }}
              onPress={() => removeCertificate(supabase, c.id).then(() => setCerts((x) => x.filter((y) => y.id !== c.id))).catch((e) => setError(messageForError(e)))}>Remove</Text>
          </View>
        ))}
        <Button label={uploading ? 'Uploading…' : 'Add certificates'} variant="secondary" onPress={addCertificates} busy={uploading} disabled={certs.length >= LIMITS.certificatesMax} />
      </Card>
      <Card>
        <Field label="Training and lineage (optional)" multiline maxLength={LIMITS.credentialsTextMax} value={text} onChangeText={(t) => (setText(t), ctx.saveDraft(3, data(certs, t)))} />
        {links.map((l, i) => (
          <Field key={i} label={`Link ${i + 1} (optional)`} placeholder="https://" autoCapitalize="none" keyboardType="url" error={errors[`links.${i}`]} value={l}
            onChangeText={(t) => { const n = links.map((x, j) => (j === i ? t : x)); setLinks(n); ctx.saveDraft(3, data(certs, text, n)); }} />
        ))}
        {links.length < LIMITS.linksMax && <Button label="Add another link" variant="secondary" onPress={() => setLinks([...links, ''])} />}
      </Card>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button label="Save and continue" onPress={() => submit(data())} busy={busy} testID="save-continue" />
    </>
  );
}

export function Step4({ ctx, next }: Props) {
  const init = (ctx.app?.snapshot?.step4 ?? {}) as Loose;
  const [video, setVideo] = useState<Loose | null>(init.videoPath ? init : null);
  const [progress, setProgress] = useState<number | null>(null);
  const { error, setError, busy, submit } = useSubmit(ctx, 4, next);

  async function pick(camera: boolean) {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['videos'], videoMaxDuration: LIMITS.videoMaxSeconds, quality: 1 };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    const mimeType = a.mimeType ?? (a.uri.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4');
    const check = validatePickedVideo({ duration: a.duration, fileSize: a.fileSize, mimeType });
    if (!check.ok) return setError(check.message);
    setError(null);
    try {
      setProgress(0);
      const size = a.fileSize ?? (await (await fetch(a.uri)).blob()).size;
      const { path } = await uploadPractitionerFile(supabase, ctx.app!.practitioner!.id, 'video', { type: mimeType, size } as Blob,
        { tusSource: { uri: a.uri, name: a.fileName ?? 'intro', type: mimeType }, onProgress: setProgress });
      const d = { videoPath: path, videoDurationSeconds: check.seconds, videoBytes: size, videoMime: mimeType };
      setVideo(d);
      ctx.saveDraft(4, d);
    } catch (e) {
      setError(messageForError(e));
    } finally {
      setProgress(null);
    }
  }
  return (
    <>
      <Card>
        <Muted>Record a short introduction: who you are, what you practise and how you help people. 30–120 seconds.</Muted>
        <Button label="Record a video" onPress={() => pick(true)} disabled={progress !== null} />
        <Button label="Choose from gallery" variant="secondary" onPress={() => pick(false)} disabled={progress !== null} testID="pick-video" />
        {progress !== null && <Muted>Uploading… {progress}%</Muted>}
        {video?.videoPath && progress === null && <Text style={{ color: color.success }}>Uploaded · {Math.round(video.videoDurationSeconds)} seconds</Text>}
      </Card>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button label="Save and continue" onPress={() => (video ? submit(video) : setError('Upload your introduction video to continue.'))} busy={busy} testID="save-continue" />
    </>
  );
}

function KycLine({ row, testID }: { row?: KycRow; testID: string }) {
  const [now] = useState(() => Date.now());
  const recent = (row?.attempt_times ?? []).filter((t) => now - new Date(t).getTime() < 86_400_000).length;
  const left = Math.max(KYC_MAX_ATTEMPTS_PER_24H - recent, 0);
  if (row?.status === 'passed') return <Text testID={testID} style={{ color: color.success }}>✓ Verified{row.masked_ref ? ` · ${row.masked_ref}` : ''}</Text>;
  if (row?.status === 'flagged') return <Text testID={testID} style={{ color: color.warning }}>Verified · names differ slightly, our team will review this</Text>;
  if (row?.status === 'failed') return <Text testID={testID} style={{ color: color.danger }}>Couldn’t verify. Check the details and try again ({left} left today).</Text>;
  return null;
}

export function Step5({ ctx, next }: Props) {
  const params = useLocalSearchParams<{ kyc?: string }>();
  const init = (ctx.app?.snapshot?.step5 ?? {}) as Loose;
  const ip = ((ctx.app?.snapshot?.step2 ?? {}) as Loose).inPerson ?? {};
  const [email, setEmail] = useState<string>(init.email ?? '');
  const [gstin, setGstin] = useState<string>(init.gstin ?? '');
  const [addr, setAddr] = useState({
    street1: init.residentialAddress?.street1 ?? ip.addressFull ?? '', street2: init.residentialAddress?.street2 ?? '',
    city: init.residentialAddress?.city ?? ip.city ?? '', state: init.residentialAddress?.state ?? '', pincode: init.residentialAddress?.pincode ?? ip.pincode ?? '',
  });
  const [pan, setPan] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [kycBusy, setKycBusy] = useState<string | null>(null);
  const [kycError, setKycError] = useState<string | null>(params.kyc === 'error' ? 'DigiLocker verification didn’t complete. Please try again.' : null);
  const { errors, error, setError, busy } = useSubmit(ctx, 5, next);
  const row = (k: string) => ctx.checks.find((c) => c.kind === k);
  const data = (e = email, x = addr, g = gstin) => ({
    email: e, residentialAddress: { ...x, street2: x.street2 || undefined }, gstin: g.trim() ? g.trim().toUpperCase() : undefined,
  });
  useEffect(() => { if (params.kyc) ctx.refresh(); }, [params.kyc, ctx]);

  async function kyc(kind: string, fn: () => Promise<unknown>) {
    setKycBusy(kind);
    setKycError(null);
    try { await fn(); await ctx.refresh(); } catch (e) { setKycError(messageForError(e)); } finally { setKycBusy(null); }
  }
  async function digilocker() {
    await ctx.flushDraft();
    const { url } = await startDigilocker(supabase, 'mobile');
    const r = await WebBrowser.openAuthSessionAsync(url, 'threenayan://apply/5');
    if (r.type === 'success' && r.url.includes('kyc=error')) setKycError('DigiLocker verification didn’t complete. Please try again.');
  }
  async function save() {
    try {
      await ctx.saveFull(5, data());
      const done = ['pan', 'aadhaar', 'bank'].every((k) => ['passed', 'flagged'].includes(row(k)?.status ?? ''));
      if (done) next();
      else setError('Your details are saved. Complete all three verifications to finish this step.');
    } catch (e) {
      setError(Object.keys(fieldErrors(e)).length ? 'Some details need another look.' : messageForError(e));
    }
  }
  const af = (k: keyof typeof addr, label: string, extra: object = {}) => (
    <Field label={label} error={errors[`residentialAddress.${k}`]} value={addr[k]} {...extra}
      onChangeText={(t) => { const n = { ...addr, [k]: t }; setAddr(n); ctx.saveDraft(5, data(email, n)); }} />
  );
  return (
    <>
      <Card>
        <Muted>Used for your payout account and invoices. Never shown to seekers.</Muted>
        <Field label="Email" error={errors.email} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={(t) => (setEmail(t), ctx.saveDraft(5, data(t)))} />
        {af('street1', 'Address line 1')}
        {af('street2', 'Address line 2 (optional)')}
        {af('city', 'City')}
        {af('state', 'State')}
        {af('pincode', 'PIN code', { keyboardType: 'number-pad', maxLength: 6 })}
        <Field label="GSTIN (optional)" error={errors.gstin} autoCapitalize="characters" maxLength={15} value={gstin}
          onChangeText={(t) => { setGstin(t); ctx.saveDraft(5, data(email, addr, t)); }} />
      </Card>
      <Card>
        <Muted>We verify these with secure government and bank checks. We never store your full Aadhaar number.</Muted>
        {kycError && <Notice tone="danger">{kycError}</Notice>}
        <Field label="PAN" autoCapitalize="characters" maxLength={10} value={pan} onChangeText={(t) => setPan(t.toUpperCase())} />
        <Button label="Verify PAN" variant="secondary" busy={kycBusy === 'pan'} onPress={() => kyc('pan', () => verifyPan(supabase, pan))} />
        <KycLine row={row('pan')} testID="kyc-pan" />
        <Button label="Verify Aadhaar with DigiLocker" variant="secondary" busy={kycBusy === 'aadhaar'} onPress={() => kyc('aadhaar', digilocker)} />
        <KycLine row={row('aadhaar')} testID="kyc-aadhaar" />
        <Field label="Account number" keyboardType="number-pad" value={account} onChangeText={(t) => setAccount(t.replace(/\D/g, ''))} />
        <Field label="IFSC" autoCapitalize="characters" maxLength={11} value={ifsc} onChangeText={(t) => setIfsc(t.toUpperCase())} />
        <Button label="Verify bank account" variant="secondary" busy={kycBusy === 'bank'} onPress={() => kyc('bank', () => verifyBank(supabase, account, ifsc))} />
        <KycLine row={row('bank')} testID="kyc-bank" />
      </Card>
      {error && <Notice tone="warning">{error}</Notice>}
      <Button label="Save and continue" onPress={save} busy={busy} testID="save-continue" />
    </>
  );
}

export function Step6({ ctx }: Props) {
  const init = (ctx.app?.snapshot?.step6 ?? {}) as Loose;
  const accepted0 = init.declarationAccepted === true && init.agreementVersion === ctx.agreementVersion;
  const [declared, setDeclared] = useState(accepted0);
  const [accepted, setAccepted] = useState(accepted0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const c = ctx.app?.completeness;
  const incomplete = c ? ([1, 2, 3, 4, 5, 6] as const).filter((n) => !c.steps[n]) : [];
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://3nayan.in';

  async function save() {
    if (!declared || !accepted) return setError('Please confirm both statements to continue.');
    setBusy(true);
    setError(null);
    try { await ctx.saveFull(6, { agreementVersion: ctx.agreementVersion, declarationAccepted: true }); } catch (e) { setError(messageForError(e)); } finally { setBusy(false); }
  }
  async function submit() {
    setBusy(true);
    setError(null);
    try { await submitApplication(supabase); router.replace('/practitioner/status'); } catch (e) { setError(messageForError(e)); setBusy(false); }
  }
  return (
    <>
      <Card>
        <Text>
          Read the <Text style={{ color: color.primary, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`${webUrl}/legal/practitioner-agreement`)}>Practitioner Agreement</Text> (version {ctx.agreementVersion}).
        </Text>
        <Checkbox checked={declared} onChange={(v) => (setDeclared(v), setError(null))} label={AGREEMENT_DECLARATION} />
        <Checkbox checked={accepted} onChange={(v) => (setAccepted(v), setError(null))} label="I accept the Practitioner Agreement" />
        <Button label="Save agreement" variant="secondary" onPress={save} busy={busy} testID="save-agreement" />
      </Card>
      <Card>
        <Text style={{ fontWeight: '600' }}>Submit your application</Text>
        <Muted>{incomplete.length ? `A few sections still need completing: ${incomplete.map((n) => `${n}. ${STEP_TITLES[n]}`).join(', ')}.` : 'Everything’s ready. Our team will review your application and contact you.'}</Muted>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button label="Submit application" onPress={submit} disabled={incomplete.length > 0} busy={busy} testID="submit-application" />
      </Card>
    </>
  );
}
