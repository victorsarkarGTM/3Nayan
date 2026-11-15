import { makeDeps } from '../_shared/deps.ts';
import { handleDigilockerCallback } from './handler.ts';

const deps = makeDeps((k) => Deno.env.get(k));
Deno.serve((req) => handleDigilockerCallback(req, deps));
