# API source upgrade guide

This guide covers useful free data sources that are not fully used by NameVetta yet. It also records which current checks rely on public profile pages and whether an official API can replace them.

## What is already configured

The production project already has credentials for Tavily, GitHub, YouTube, Companies House, Gemini, Groq and Supabase. `CONTACT_EMAIL` is also configured for identified requests to services such as SEC EDGAR.

Do not create replacement keys for those services unless a key expires. Vercel displays their values as hidden, which is correct.

## Where to store a new key

Never put a real key in `.env.example`, Git, an issue or a chat message.

For the deployed site:

1. Open the NameVetta project in the Vercel dashboard.
2. Open **Settings**, then **Environment Variables**.
3. Enter the variable name from this guide.
4. Paste the key as its value.
5. Select **Production** and **Preview**. Select **Development** only if local Vercel development needs the key.
6. Save the variable.
7. Redeploy the latest production deployment. Environment changes do not alter an already-built deployment.

For local development, add the same variable to `.env.local`. This file is ignored by Git.

## Recommended additions

### 1. Expand the Apple search already in the project

**Cost:** Free  
**Account or key:** None  
**Best for:** Apps, podcasts, music, books, films and media projects

The project already calls Apple's iTunes Search API, but it requests only `entity=software`. Apple supports podcast, music, audiobook, ebook, film and TV searches through the same endpoint.

No signup is needed. Add category-specific requests such as:

```text
https://itunes.apple.com/search?term=NAME&media=podcast&entity=podcast&limit=20&country=US
https://itunes.apple.com/search?term=NAME&media=music&entity=musicArtist&limit=20&country=US
https://itunes.apple.com/search?term=NAME&media=ebook&entity=ebook&limit=20&country=US
```

Keep the combined adapter below Apple's documented approximate limit of 20 calls per minute. Run only the media searches relevant to the selected category. Treat results as existing titles, not proof that a name is legally unavailable.

Official documentation: <https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html>

### 2. Add GitLab project discovery

**Cost:** Free  
**Account or key:** Optional for public project search, recommended for stable production limits  
**Best for:** Apps, SaaS, developer tools and open-source projects

NameVetta already uses GitLab's official API to check an exact username. It does not search public GitLab projects with similar names.

To create a token:

1. Sign in at <https://gitlab.com>.
2. Select your avatar, then **Edit profile**.
3. Open **Access**, then **Personal access tokens**.
4. From **Generate token**, choose **Legacy token**.
5. Name it `NameVetta public search` and choose a reasonable expiry date.
6. Select only `read_api`.
7. Generate the token and copy it immediately. GitLab will not show it again.
8. Store it in Vercel as `GITLAB_TOKEN`.

Use it only on the server in the `PRIVATE-TOKEN` header. A project discovery request can use:

```text
GET https://gitlab.com/api/v4/projects?search=NAME&simple=true&per_page=20
```

This source should be discovery evidence. A matching project is meaningful, but GitLab project search does not control a global product-name namespace.

Official documentation: <https://docs.gitlab.com/user/profile/personal_access_tokens/> and <https://docs.gitlab.com/api/projects/>

### 3. Add Twitch handle checking

**Cost:** Free  
**Account or key:** Twitch developer application  
**Best for:** Creators, streamers, games, communities and media projects

Twitch is currently a manual link in NameVetta. Twitch's official Helix API can check an exact login.

To get credentials:

1. Sign in to Twitch and verify the account email.
2. Enable two-factor authentication. Twitch requires it for developer applications.
3. Open <https://dev.twitch.tv/console/apps>.
4. Choose **Register Your Application**.
5. Enter a unique application name.
6. Add `https://namevetta.vercel.app` as the OAuth redirect URL. The lookup uses an app token, but Twitch still asks for a redirect URL during registration.
7. Select the closest website or analytics category and create the application.
8. Open **Manage** and copy the Client ID.
9. Select **New Secret** and copy the Client Secret.
10. Store them as `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`.

The server obtains a short-lived app token with the client credentials flow:

```text
POST https://id.twitch.tv/oauth2/token
  ?client_id=TWITCH_CLIENT_ID
  &client_secret=TWITCH_CLIENT_SECRET
  &grant_type=client_credentials
```

Cache the token until shortly before `expires_in`. Then check a handle with:

```text
GET https://api.twitch.tv/helix/users?login=HANDLE
Authorization: Bearer APP_ACCESS_TOKEN
Client-Id: TWITCH_CLIENT_ID
```

A non-empty `data` array means the login exists. An empty array means no current user was returned. A 401, 429 or malformed response must remain `unable_to_verify`.

Official documentation: <https://dev.twitch.tv/docs/authentication/register-app> and <https://dev.twitch.tv/docs/api/get-started>

### 4. Add Open Library title discovery

**Cost:** Free  
**Account or key:** None  
**Best for:** Books, newsletters, publications, courses and education projects

No signup is needed. Open Library asks regular callers to identify themselves. Reuse the existing `CONTACT_EMAIL` value in the User-Agent:

```text
User-Agent: NameVetta/1.0 (CONTACT_EMAIL)
```

Use the title field and request only fields needed by the report:

```text
GET https://openlibrary.org/search.json?title=NAME&fields=key,title,author_name,first_publish_year,edition_count&limit=10
```

Unidentified requests are limited to about one request per second. Identified requests receive about three requests per second. Cache results and run this source only for relevant categories. A book title match is discovery evidence, not namespace ownership.

Official documentation: <https://openlibrary.org/developers/api>

### 5. Add Stack Exchange discovery

**Cost:** Free  
**Account or key:** Free Stack Apps API key  
**Best for:** Developer tools, libraries, SaaS and technical products

To get the key:

1. Sign in at <https://stackapps.com>.
2. Open <https://stackapps.com/apps/oauth/register>.
3. Register `NameVetta` with the live website URL and domain.
4. Open the new application in the Stack Apps dashboard.
5. Select **Generate API Key**.
6. Copy the key immediately and store it as `STACK_EXCHANGE_KEY` in Vercel.

Public read-only search needs only the key. OAuth and a client secret are unnecessary. Start with title matches on Stack Overflow:

```text
GET https://api.stackexchange.com/2.3/search/advanced?site=stackoverflow&title=NAME&pagesize=20&key=STACK_EXCHANGE_KEY
```

The default registered-key quota is 10,000 requests per day. Honour the `backoff` field in every response and do not repeat an identical request more than once per minute. Results should be low-weight discovery evidence because ordinary words can appear in unrelated questions.

Official documentation: <https://stackapps.com/help/api-authentication> and <https://api.stackexchange.com/docs/throttle>

### 6. Add the Norwegian company register

**Cost:** Free  
**Account or key:** None  
**Best for:** Companies, shops, agencies, services and local businesses

No signup is needed. Search the official Brønnøysund Register Centre API:

```text
GET https://data.brreg.no/enhetsregisteret/api/enheter?navn=NAME&navnMetodeForSoek=FORTLOEPENDE&size=20
```

Use the registered name, organisation number, status, website and industry code as evidence. This is strong evidence for a Norwegian business and weak evidence outside that market. Cache results, use modest concurrency and honour `429` responses.

Official documentation: <https://data.brreg.no/enhetsregisteret/api/dokumentasjon/en/index.html>

### 7. Add academic and publication discovery

Use these only for education, research, publication and newsletter categories.

#### OpenAlex

**Cost:** Free allowance  
**Key:** Recommended

1. Create an account at <https://openalex.org>.
2. Open the account settings page.
3. Create or copy the API key shown under API access.
4. Store it as `OPENALEX_API_KEY`.

Example:

```text
GET https://api.openalex.org/works?search=NAME&select=id,title,publication_year,doi,type,cited_by_count&per_page=10&api_key=OPENALEX_API_KEY
```

Official documentation: <https://help.openalex.org/api/authentication/>

#### Crossref

**Cost:** Free  
**Account or key:** None

No signup is needed. Use the polite pool by passing the existing contact email:

```text
GET https://api.crossref.org/works?query.title=NAME&rows=10&select=DOI,title,publisher,published,type,is-referenced-by-count&mailto=CONTACT_EMAIL
```

Official documentation: <https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/>

Use publication year, citation count and identifiers to separate an established title from a weak text match. Neither source establishes legal availability.

## Current checks that do not use a documented API

The following active checks use a public page or subdomain response instead of a documented API:

| Current check | Better free API? | Recommendation |
|---|---|---|
| Twitch | Yes | Replace the manual link with the official Helix API described above. |
| Flickr | Yes | Replace the profile-page probe with `flickr.people.findByUsername` after obtaining a Flickr API key. |
| LinkedIn company page | No suitable public API | Keep it low confidence or move it to manual checking. LinkedIn does not provide open arbitrary-company availability search. |
| Substack subdomain | No public search API | Keep the direct namespace probe, with conservative confidence. |
| Dribbble and Behance profiles | No suitable unrestricted search API | Keep conservative probes or make them manual if source health declines. |
| SoundCloud profile | Official API access is application-controlled | Keep the probe until SoundCloud approves an application, then migrate to official user search. |
| X profile | No durable free official lookup tier | Keep conservative or manual. Do not add a paid dependency just to replace one handle check. |
| Linktree and About.me | No public official availability API | Keep conservative probes or manual links. |
| Patreon page | API does not provide arbitrary creator-name search for this use | Keep conservative or manual. |
| itch.io subdomain | No public search API | The direct subdomain is the actual namespace, so the current probe is useful. |
| Slack workspace | No public availability API | Keep manual. The current code already avoids treating a blocked request as a free workspace. |
| Google Play | No official public search API | Keep Tavily discovery with its low confidence ceiling. Do not replace it with a scraper API. |
| Instagram, TikTok and Threads | No official arbitrary-handle lookup | Keep manual. Their APIs expose authorized accounts, not global username availability. |
| Reddit community | Access requires Reddit approval and commercial terms may apply | Keep manual until explicit API approval is granted. |

### Flickr key steps

1. Sign in to Flickr.
2. Open <https://www.flickr.com/services/apps/create/apply/>.
3. Request a non-commercial or commercial key according to the real use of the deployed service.
4. Describe the exact read-only call: checking whether a public username exists.
5. Copy the API key and store it as `FLICKR_API_KEY`.
6. Call `flickr.people.findByUsername` and treat API errors or rate limits as unverified.

Official API index: <https://www.flickr.com/services/api/>

## APIs that should not be added yet

- **Brave Search:** The monthly credit is useful, but the current free-plan terms prohibit retaining API results. NameVetta stores source evidence in reports, so this does not fit the current persistence design without separate permission.
- **Product Hunt:** The official API is non-commercial by default. The existing adapter is inactive. Obtain written commercial permission before enabling it in a public product.
- **Unofficial Google Play, Instagram or TikTok APIs:** Most are scraper services. They can disappear, return false positives or violate platform terms.
- **Common Crawl at request time:** Its index API is heavily rate-limited and is better suited to background datasets than an interactive scan.

## Implementation order

1. Expand Apple media searches. No key or signup is required.
2. Add Twitch with an official app token.
3. Add GitLab project discovery.
4. Add Open Library.
5. Replace Flickr's page probe with its API.
6. Add Brønnøysund for company-oriented categories.
7. Add Stack Exchange, OpenAlex and Crossref only to relevant categories.

Each new adapter must pass a live known-match and known-no-match probe before release. Exact matches, similar matches and ordinary mentions must remain separate. Timeouts, blocks, malformed responses and rate limits must reduce coverage instead of producing a clear result.
