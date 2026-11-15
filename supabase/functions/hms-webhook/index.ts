import { makeDeps } from '../_shared/deps.ts';
import { hmsWebhook } from './handler.ts';

const deps = makeDeps((k) => Deno.env.get(k));
Deno.serve((req) => hmsWebhook(req, deps));
