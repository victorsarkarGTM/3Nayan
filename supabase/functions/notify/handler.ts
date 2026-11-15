import { z } from 'zod';
import { requireServiceRole } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { notify } from '../_shared/notifications/notify.ts';
import { TEMPLATES, type TemplateKey } from '../_shared/notifications/templates.ts';

const schema = z.object({
  userId: z.string().uuid(),
  key: z.enum(Object.keys(TEMPLATES) as [TemplateKey, ...TemplateKey[]]),
  data: z.record(z.string()).default({}),
});

/** Internal fan-out endpoint (service role only). */
export async function notifyHandler(req: Request, deps: Deps) {
  requireServiceRole(req, deps);
  const body = await parseBody(req, schema);
  return notify(deps, body.userId, body.key, body.data);
}
