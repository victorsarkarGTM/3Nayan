import { execSync } from 'node:child_process';

/** Read the local Supabase stack's URL and keys so tests can talk to it. */
export default function setup() {
  const out = execSync('pnpm --silent --filter @3nayan/db exec supabase --workdir ../.. status -o env', {
    cwd: new URL('../../..', import.meta.url).pathname,
    encoding: 'utf8',
  });
  const env = Object.fromEntries(
    out
      .split('\n')
      .map((l) => l.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2]]),
  );
  process.env.SUPABASE_URL = env.API_URL;
  process.env.SUPABASE_ANON_KEY = env.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SERVICE_ROLE_KEY;
}
