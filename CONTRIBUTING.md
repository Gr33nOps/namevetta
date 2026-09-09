# Contributing

Use Node.js 22. Follow the setup instructions in the README, then create a branch for your change.

Keep changes focused. For bug fixes, include a regression test that reproduces the failure. Source adapters must preserve uncertainty: a blocked or failed check must not become a clear result. Follow [the copy guidelines](docs/COPY_STYLE.md) for user-facing text.

Before opening a pull request, run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. For interface changes, also run `npm run test:e2e` and check narrow screens and reduced-motion settings.

Describe the problem, the change, and what you tested. Never commit credentials, local environment files, account exports, or diagnostic captures. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

Contributions are provided under the repository's MIT license.
