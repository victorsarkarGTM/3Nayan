import { makeDeps } from '../_shared/deps.ts';
import { withHandler } from '../_shared/http.ts';
import { trialSelect } from './handler.ts';

const deps = makeDeps((k) => Deno.env.get(k));
Deno.serve(withHandler(trialSelect, () => deps));
