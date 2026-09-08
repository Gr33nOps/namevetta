<p align="center">
  <img src="assets/logo/namevetta-mark.png" width="84" alt="NameVetta mark">
</p>

<h1 align="center">NameVetta</h1>

<p align="center">Check a name before you make it yours.</p>

<p align="center"><a href="https://namevetta.vercel.app">Open NameVetta</a></p>

![NameVetta in dark mode](assets/screenshots/home-dark.png)

NameVetta researches existing uses of a name across domains, social platforms, businesses, code registries, and app stores. Check a name you already have, or describe an idea and explore a screened shortlist.

## What it does

- **Research a name.** Choose a category and run a Quick Check or Deep Research. Reports separate conflicts, similar names, clear results, and checks that still need a person.
- **Find four name ideas.** Describe your audience, purpose, and preferred tone. AI generates a candidate pool, then a separate editorial pass reviews distinctiveness, meaning, pronunciation, and spelling.
- **Screen before showing names.** Candidates undergo exact `.com` registration lookups and conflict checks. Rejected candidates are replaced in further rounds. A successful run returns exactly four names; if four cannot be verified within the run, it offers a retry instead of padding the list.
- **Keep your research.** Signed-in users can revisit their history and saved names.

## A look at the product

### Light and dark themes

![NameVetta in light mode](assets/screenshots/home-light.png)

### Describe an idea freely

![Current name generator](assets/screenshots/ideas-dark.png)

### Categories and mobile

![Grouped category picker](assets/screenshots/categories-dark.png)

<p align="center"><img src="assets/screenshots/ideas-mobile.png" width="320" alt="NameVetta generator on mobile"></p>

The interface uses translucent glass surfaces, the logo's blue-violet gradients, and neutral text. Floating loading cards, animated progress stages, and staggered results show activity while research runs. Motion respects reduced-motion preferences.

Screenshots captured from the live website in September 2026.

## What a result means

A clear check means that source completed its check without finding a conflict. A `.com` result marked "No registration found" reflects an RDAP lookup, not a guarantee that a registrar will sell the domain. Purchase confirmation and trademark clearance are separate.

Failed, blocked, skipped, and manual-only checks are not counted as verified clear results. AI helps create and review names; it does not certify legal availability or pretend to have conducted native-speaker or customer testing.

See [how the checks work](https://namevetta.vercel.app/how-it-works) and the live [source status](https://namevetta.vercel.app/status) page for current coverage.

## Technology

Built with Next.js, React, TypeScript, Supabase, Groq, and Vercel. Research runs server-side and is normalised into structured evidence. The [architecture overview](docs/architecture.md) describes the public product flow.

## Feedback

NameVetta is live at [namevetta.vercel.app](https://namevetta.vercel.app). Report reproducible product issues through this repository's [issues](https://github.com/Gr33nOps/namevetta/issues).

## Proprietary project

This repository is a public product showcase. NameVetta is proprietary and may not be copied, redistributed, or operated from this repository. Read [LICENSE](LICENSE) for the full terms.

For security reports, read [SECURITY.md](SECURITY.md).
