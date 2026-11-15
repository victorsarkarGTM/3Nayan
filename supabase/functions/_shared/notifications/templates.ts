export type Channel = 'sms' | 'whatsapp' | 'push';
export type TemplateKey =
  | 'application_submitted'
  | 'application_changes_requested'
  | 'trial_proposed'
  | 'trial_pick_reminder'
  | 'trial_reminder'
  | 'application_approved'
  | 'application_rejected'
  | 'account_suspended';

export type Rendered = { vars: Record<string, string>; pushTitle: string; pushBody: string };
type Template = { channels: Channel[]; render: (d: Record<string, string>) => Rendered };

const ALL: Channel[] = ['sms', 'whatsapp', 'push'];
const name = (d: Record<string, string>) => d.name ?? 'there';

/** Spec §10. SMS template ids come from env MSG91_TEMPLATE_<KEY>; WhatsApp templates are named after the key. */
export const TEMPLATES: Record<TemplateKey, Template> = {
  application_submitted: {
    channels: ['whatsapp', 'push'],
    render: (d) => ({
      vars: { name: name(d) },
      pushTitle: 'Application received',
      pushBody: "Thanks for applying to 3Nayan. We'll review your application and get back to you.",
    }),
  },
  application_changes_requested: {
    channels: ALL,
    render: (d) => ({
      vars: { name: name(d), reason: d.reason ?? '' },
      pushTitle: 'A few changes needed',
      pushBody: 'Our team asked for some changes to your application. Open 3Nayan to see what to update.',
    }),
  },
  trial_proposed: {
    channels: ALL,
    render: (d) => ({
      vars: { name: name(d), slots: d.slots ?? '' },
      pushTitle: 'Pick a time for your trial call',
      pushBody: `Choose one of these times: ${d.slots ?? ''}`,
    }),
  },
  trial_pick_reminder: {
    channels: ['whatsapp', 'push'],
    render: (d) => ({
      vars: { name: name(d) },
      pushTitle: 'Your trial call is waiting',
      pushBody: "You haven't picked a time for your trial call yet. Open 3Nayan to choose one.",
    }),
  },
  trial_reminder: {
    channels: ALL,
    render: (d) => ({
      vars: { name: name(d), time: d.time ?? '' },
      pushTitle: 'Trial call in 1 hour',
      pushBody: `Your 3Nayan trial call starts at ${d.time ?? 'the scheduled time'}. Join from the app.`,
    }),
  },
  application_approved: {
    channels: ALL,
    render: (d) => ({
      vars: { name: name(d) },
      pushTitle: "You're approved!",
      pushBody: 'Welcome to 3Nayan. Your practitioner application has been approved.',
    }),
  },
  application_rejected: {
    channels: ALL,
    render: (d) => ({
      vars: { name: name(d), reason: d.reason ?? '', reapplyDate: d.reapplyDate ?? '' },
      pushTitle: 'Application update',
      pushBody: 'We could not approve your application this time. Open 3Nayan for details.',
    }),
  },
  account_suspended: {
    channels: ALL,
    render: (d) => ({
      vars: { name: name(d), reason: d.reason ?? '' },
      pushTitle: 'Account suspended',
      pushBody: 'Your practitioner account has been suspended. Open 3Nayan or contact support for details.',
    }),
  },
};
