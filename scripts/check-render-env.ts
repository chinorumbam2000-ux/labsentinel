/**
 * Render static-site build guard (render.yaml runs it before `npm run build`):
 *
 *   npx vite-node scripts/check-render-env.ts
 *
 * Fails the build — instead of publishing a site that silently calls
 * localhost, plain http or a placeholder — when the full-stack environment
 * is incomplete. Prints variable names and problems only, never values of
 * anything that could be secret.
 */
import { renderEnvProblems } from '../src/lib/renderEnv';

const env = (globalThis as { process?: { env: Record<string, string | undefined>; exit: (code: number) => never } }).process;
const problems = renderEnvProblems(env?.env ?? {});

if (problems.length) {
  console.error('Render build configuration is not deployable:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('Set the values in the Render Dashboard (docs/deployment.md, "Render deployment"), then redeploy.');
  env?.exit(1);
} else {
  console.log('Render build configuration OK: API Capstone Mode, https API, root base path, no secrets in VITE_*.');
}
