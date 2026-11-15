import { AppError } from '../_shared/core/index.ts';
import type { Deps } from '../_shared/deps.ts';
import { withHandler } from '../_shared/http.ts';

const EVENTS: Record<string, 'join' | 'leave'> = { 'peer.join.success': 'join', 'peer.leave.success': 'leave' };

async function handle(req: Request, deps: Deps) {
  const secret = deps.env('HMS_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-3nayan-webhook-secret') !== secret) throw new AppError('unauthenticated');
  const body = (await req.json().catch(() => ({}))) as {
    type?: string;
    data?: { room_id?: string; user_id?: string; joined_at?: string; left_at?: string };
  };
  const event = body.type ? EVENTS[body.type] : undefined;
  if (!event || !body.data?.room_id) return { ignored: true };
  const { data: trial } = await deps.db.from('trial_calls').select('id').eq('hms_room_id', body.data.room_id).maybeSingle();
  if (!trial) return { ignored: true };
  const at = (event === 'join' ? body.data.joined_at : body.data.left_at) ?? deps.now().toISOString();
  const { error } = await deps.db.from('call_events').insert({
    call_kind: 'trial',
    call_id: trial.id,
    user_id: body.data.user_id ?? null,
    event,
    at,
  });
  if (error) throw new Error(error.message);
  return { recorded: true };
}

/** 100ms webhook (authenticated by a shared-secret header configured in the 100ms dashboard). */
export function hmsWebhook(req: Request, deps: Deps): Promise<Response> {
  return withHandler(handle, () => deps)(req);
}
