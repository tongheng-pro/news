/**
 * Rebuild the static site on a fixed interval so the deployed `dist/` stays
 * fresh. Use this when you host the built output on a static server / CDN.
 *
 *   node scripts/refresh-loop.mjs            # rebuild every 15 min
 *   REFRESH_MINUTES=5 node scripts/refresh-loop.mjs
 *   node scripts/refresh-loop.mjs -- --deploy "rsync -a dist/ user@host:/var/www/news/"
 *
 * Each cycle runs `npm run build`; if a --deploy command is given it runs after
 * a successful build. Ctrl-C to stop. For a real server prefer a systemd timer
 * or cron (see README) — this is the zero-setup option.
 */
import { spawn } from 'node:child_process';

const minutes = Number(process.env.REFRESH_MINUTES) || 15;
const intervalMs = Math.max(1, minutes) * 60_000;

const deployIdx = process.argv.indexOf('--deploy');
const deployCmd = deployIdx !== -1 ? process.argv[deployIdx + 1] : null;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: true });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
  console.log('\n[refresh-loop] stopping after current cycle…');
});

async function cycle() {
  const started = new Date();
  console.log(`\n[refresh-loop] ${started.toISOString()} — rebuilding…`);
  try {
    await run('npm', ['run', 'build']);
    if (deployCmd) {
      console.log(`[refresh-loop] deploying: ${deployCmd}`);
      await run(deployCmd, []);
    }
    console.log(`[refresh-loop] done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error('[refresh-loop] cycle failed:', err.message, '— will retry next interval');
  }
}

console.log(`[refresh-loop] rebuilding every ${minutes} min${deployCmd ? ' + deploy' : ''}. Ctrl-C to stop.`);
await cycle();
while (!stopping) {
  await new Promise((r) => setTimeout(r, intervalMs));
  if (!stopping) await cycle();
}
