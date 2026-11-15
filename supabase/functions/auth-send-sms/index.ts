import { makeDeps } from '../_shared/deps.ts';
import { handleSendSms } from './handler.ts';

const deps = makeDeps((k) => Deno.env.get(k));
Deno.serve((req) => handleSendSms(req, deps));
