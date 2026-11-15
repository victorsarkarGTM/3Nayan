import { makeDeps } from '../_shared/deps.ts';
import { withHandler } from '../_shared/http.ts';
import { trialJoinToken } from './handler.ts';

const deps = makeDeps((k) => Deno.env.get(k));
Deno.serve(withHandler(trialJoinToken, () => deps));
