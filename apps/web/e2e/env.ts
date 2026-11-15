import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/** Local Supabase URL and keys (from `supabase status`). */
export function localEnv(): { url: string; anon: string; service: string } {
  const out = execSync('pnpm --silent --filter @3nayan/db exec supabase --workdir ../.. status -o env', {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const get = (k: string) => out.match(new RegExp(`^${k}="?(.*?)"?$`, 'm'))?.[1] ?? '';
  return { url: get('API_URL'), anon: get('ANON_KEY'), service: get('SERVICE_ROLE_KEY') };
}
