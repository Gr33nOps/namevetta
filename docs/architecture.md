# Product architecture

This repository describes NameVetta's public product flow. Application source, credentials, scoring weights, and operational configuration remain private.

```mermaid
flowchart TD
  A[Check a name] --> B[Choose category and research depth]
  B --> C[Server-side research]
  C --> D[Structured evidence and coverage]
  D --> E[Research report]
  E --> F[History and saved names]

  G[Describe an idea] --> H[AI naming directions and candidate pool]
  H --> I[Quality filters and AI editorial review]
  I --> J[Exact .com registration lookup]
  J --> K[Conflict and evidence checks]
  K --> L{Four names pass?}
  L -->|Yes| M[Four-name shortlist]
  L -->|No, budget remains| H
  L -->|Run limit reached| N[Explain and offer retry]
  M --> F
```

Generation and verification are separate. AI proposes and edits names based on the brief; registration lookups and research sources supply availability evidence. Replacement rounds exclude candidates already rejected by the checks. Runs are bounded and never fill missing slots with unverified names.

The interface shows real screening progress, supports cancelling a run, and retains the brief when the user returns to edit it. Successful generation returns four names, each with its research score, coverage, and checked `.com`.

Reports distinguish verified observations, discovery evidence, manual checks, and missing evidence. A failed or skipped lookup is not a clear result. Domain registration status does not establish trademark clearance or guarantee a domain can be purchased.

The live [source status](https://namevetta.vercel.app/status) page shows the current public catalog and source modes.
