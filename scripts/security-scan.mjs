// Runs the free, no-account (or already-authenticated) security scanners over
// the repo and prints one summary. Every scanner is optional: a missing tool is
// reported as SKIPPED rather than failing the run, so this works on any machine
// and degrades the same way the product itself does.
//
//   npm run security
//
// Install the scanners (all free) to get full coverage:
//   winget install AquaSecurity.Trivy      # filesystem secret + misconfig
//   cargo install osv-scanner              # dependency vulnerabilities (no account)
//   cargo install gitleaks                 # committed-secret detection
//   uv tool install semgrep                # SAST (fetches OSS rulesets)
//   npm i -g snyk && snyk auth             # deps + code (free account)
//
// This is a report, not a CI gate: it exits 0 even when a scanner finds
// something, so it never blocks unexpectedly. Read the output.

import { spawnSync } from 'node:child_process'

const isWindows = process.platform === 'win32'

/** Resolve a tool on PATH, returning its name if runnable, else undefined. */
function has(tool) {
  const probe = spawnSync(isWindows ? 'where' : 'which', [tool], { encoding: 'utf8' })
  return probe.status === 0 ? tool : undefined
}

/** Run a scanner, streaming its output, and return whether it exited clean. */
function run(label, tool, args) {
  if (has(tool) === undefined) {
    results.push({ label, state: 'SKIPPED', note: `${tool} not installed` })
    console.log(`\n── ${label}: SKIPPED (${tool} not installed)`)
    return
  }
  console.log(`\n── ${label} (${tool} ${args.join(' ')})`)
  const out = spawnSync(tool, args, { encoding: 'utf8', shell: isWindows })
  if (out.stdout) process.stdout.write(out.stdout)
  if (out.stderr) process.stderr.write(out.stderr)
  // Convention across these tools: 0 = clean, non-zero = findings or error.
  results.push({ label, state: out.status === 0 ? 'CLEAN' : 'FINDINGS', note: `exit ${out.status}` })
}

const results = []

run('Secret scan (git history)', 'gitleaks', ['git', '--no-banner', '--redact', '.'])
run('Dependency vulns', 'osv-scanner', ['--lockfile=package-lock.json'])
run('Filesystem secrets + misconfig', 'trivy', [
  'fs',
  '--scanners',
  'secret,misconfig',
  '--skip-dirs',
  'node_modules',
  '--skip-dirs',
  '.next',
  '--exit-code',
  '1',
  '.',
])
run('SAST', 'semgrep', [
  '--config',
  'p/typescript',
  '--config',
  'p/react',
  '--config',
  'p/security-audit',
  '--config',
  'p/secrets',
  '--error',
  'src',
])
run('Snyk dependencies', 'snyk', ['test', '--severity-threshold=low'])

console.log(`\n${'='.repeat(48)}\nSecurity scan summary\n${'='.repeat(48)}`)
for (const r of results) {
  console.log(`  ${r.state.padEnd(9)} ${r.label}  (${r.note})`)
}
const findings = results.filter((r) => r.state === 'FINDINGS')
console.log(
  findings.length === 0
    ? '\nNo findings from the scanners that ran. Review any SKIPPED for gaps.'
    : `\n${findings.length} scanner(s) reported findings above. Review before shipping.`,
)
// Report-only: never fail the process on findings, so this stays a tool the
// team runs, not a gate that surprises a merge.
process.exit(0)
