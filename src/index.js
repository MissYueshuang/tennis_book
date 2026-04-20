import { assertConfig, config } from './config.js';
import { run } from './booker.js';
import fs from 'node:fs';

assertConfig();

const result = await run();
console.log('\nRESULT:', JSON.stringify(result, null, 2));

// Emit result for GitHub Actions to pick up.
const summary = {
  booked: result.booked,
  reason: result.reason,
  dryRun: config.dryRun,
  at: new Date().toISOString(),
};
fs.writeFileSync('artifacts/result.json', JSON.stringify(summary, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    '## Tennis booking run',
    `- booked: **${result.booked}**`,
    `- reason: \`${result.reason}\``,
    `- dry run: ${config.dryRun}`,
    result.error ? `- error: \`${result.error}\`` : '',
  ]
    .filter(Boolean)
    .join('\n');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}

// Non-zero exit when an unexpected error occurred, so the workflow flags it.
// "No match" is normal — exit 0 so cron stays quiet.
if (result.reason === 'error') process.exit(1);
