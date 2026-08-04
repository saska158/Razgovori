# Razgovori — Moderation Server

A Node.js server that runs an agentic content moderation loop for the Razgovori social media app. When a user reports a post, the server:

1. Routes to the best-matching **skill** via Claude Haiku (with retry if no skill is selected). Image-only posts skip the LLM and route directly to `content-toxicity`.
2. Runs a **Claude Sonnet moderation agent** that autonomously gathers context and makes a decision: dismiss, warn, remove post, ban user, or escalate to human. Escalated reports are surfaced to the admin review page in the frontend; a human resolves them via `POST /admin/resolve`

The agent decides which tools to call — including `analyze_image` to inspect attached images (post text is passed as context so combined threats are caught) and `call_perspective` to score the post for toxicity using the Perspective API. Both scores are gathered as part of the agent's reasoning, not pre-computed before it runs.

---

## Prerequisites

- Node.js 18+
- API keys (see Setup below)

---

## Setup

### 1. Clone the repo and navigate to the server

```bash
git clone <repo-url>
cd <repo-name>/server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in the three values:

```
ANTHROPIC_API_KEY=
PERSPECTIVE_API_KEY=
FIREBASE_SERVICE_ACCOUNT=
```

#### Where to get each key

| Key | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | Ask the repo owner to share privately |
| `PERSPECTIVE_API_KEY` | Ask the repo owner to share privately for testing |
| `FIREBASE_SERVICE_ACCOUNT` | Ask the repo owner to share privately |

`FIREBASE_SERVICE_ACCOUNT` is the entire Firebase service account JSON as a single-line string:
```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
```

---

## Running the server

```bash
npm start         # production
npm run dev       # development (auto-restarts on file changes)
```

Server runs on `http://localhost:4000`.

---

## Running the full app

You need two terminals:

```bash
# Terminal 1 — React frontend (from repo root)
npm install
npm start
# → http://localhost:3000

# Terminal 2 — Moderation server
cd server
npm start
# → http://localhost:4000
```

---

## API

### `POST /report`

Triggers the moderation agent for a reported post.

**Body:**
```json
{
  "postId": "abc123",
  "room": "watching",
  "reportedBy": "<uid>",
  "creatorUid": "<uid>",
  "postText": "the post content",
  "postImage": "https://..."
}
```

`postText` and `postImage` are both optional but at least one must be present. Image-only posts are valid.

**Response:**
```json
{
  "reportId": "xyz789"
}
```

The decision is not returned in this response — the agent runs asynchronously. Subscribe to `GET /report/:reportId/stream` to receive events as the agent works.

### `GET /report/:reportId/stream`

Server-sent events (SSE) stream for a report. Returns events as the router and moderation agent run. See the SSE event types table below for the full list.

Possible `action` values in the final `decision` event: `dismiss_report`, `warn_user`, `remove_post`, `ban_user`, `escalate_to_human`

### `POST /admin/resolve`

Resolves an escalated report. Called by the admin page when a human makes a decision.

**Body:**
```json
{
  "reportId": "xyz789",
  "action": "warn_user",
  "reasoning": "The post was borderline — warning is appropriate given no prior history."
}
```

`action` must be one of: `dismiss_report`, `warn_user`, `remove_post`, `ban_user`. Executes the same tool as the agent would, writing the result to Firestore and updating the report status.

### `GET /health`

Returns `{ "status": "ok" }`. Use this to verify the server is running.

---

## Agentic loop

This server is designed to demonstrate a true agentic loop — not a linear fetch-process-complete pipeline.

### What makes it agentic

**Non-linear tool selection.** The agent decides which tools to call based on what it finds. A clear high-severity post might only call `get_user_violations` then decide. An ambiguous borderline case might call all context tools in a different order. The sequence is never predetermined. For harassment cases, the agent may call `get_posts_targeting_victim` to detect coordinated pile-ons across multiple users, or `get_posts_by_user_in_room` to find other posts by the same perpetrator — expanding investigation scope dynamically based on what it finds.

**Variable-scope actions.** For harassment cases involving a pattern of posts, the agent can call `remove_additional_post` during investigation — removing discovered posts without stopping the loop — before finalizing with a single `remove_post` or `ban_user`. The number of posts removed is unknown until runtime. The verification prompt tells the agent how many additional posts it has already removed, and the final `decision` event includes an `additionalRemovals` array.

**Reactive reasoning.** Each tool result is added back to the conversation. The agent's next step is informed by what it just learned — not by a fixed script. Reasoning events emitted after tools have been called are flagged `reactive: true` in the SSE stream.

**Self-correcting verification step.** When the agent makes a decision, the system sends it an open reflection prompt: *"You've reached a decision. Before this is finalized, reflect: are you confident? What was the key signal that drove it? If anything still feels uncertain, gather more context or revise."* The agent decides what to reconsider — it's not given a checklist. It can call a different decision tool and change its mind. This produces two possible paths:
- `verification_confirmed` — decision stands after reflection
- `verification_revised` — agent changed its decision after seeing its own reasoning challenged

**Autonomous routing with retry.** The router (Claude Haiku) reads available skill files from the filesystem and classifies the report. If it doesn't call `select_skill` on the first attempt, the router sends a follow-up message and retries before falling back.

**Perspective as an agent tool.** The agent calls `call_perspective` itself as one of its context tools, rather than receiving the score as a pre-computed input. This means the toxicity signal appears in the agent's explicit reasoning trace — the agent decides when the score is relevant, weighs it against other context it has gathered, and references it directly in its decision. For violation types where toxicity tone is a weak signal (e.g. calm misinformation), the agent may skip it entirely.

**Image analysis with combined context.** When a post has an image, the agent calls `analyze_image` with the image URL and the post text as context. The vision model (Claude Sonnet) sees both together — a house photo paired with "I know where you live" is flagged as a threat even though each element is benign in isolation. Images are downloaded server-side and sent as base64; AVIF format images are re-fetched as JPEG via a Cloudinary URL extension swap before analysis. If image analysis fails (unsupported format or network error), the agent treats it as missing data rather than evidence of a violation. If the image returns no clear flags but the combination of image and text creates an unresolvable signal — for example, a location photo with vague but suggestive text, or a meme where satirical intent is genuinely unclear — the agent escalates to human rather than defaulting to dismiss.

### SSE event types

| Event | What it means |
|---|---|
| `router_reasoning` | Router's text reasoning before skill selection |
| `routing` | Skill selected (or fallback) |
| `iteration` | New agent loop iteration started |
| `reasoning` | Agent's text reasoning; `reactive: true` means it follows tool results |
| `tool_call` | Agent called a tool (including `call_perspective`) |
| `perspective` | Perspective API score returned — emitted when agent calls `call_perspective` |
| `tool_result` | Tool returned data |
| `verification` | Agent made a decision — awaiting self-check |
| `verification_confirmed` | Agent confirmed its decision after reflection |
| `verification_revised` | Agent changed its decision during verification |
| `decision` | Final action taken; includes `additionalRemovals[]` listing any posts removed during investigation |
| `skipped_tools` | Tools the agent chose not to call |
| `done` | Pipeline complete |

### Test scenarios

The `scenarios/` directory contains machine-readable test inputs covering all four skills:

```
scenarios/
  content-toxicity.json    — slurs, sarcasm, repeat offenders
  harassment.json          — targeted attacks, mutual arguments, pile-ons, retaliatory reporting
  misinformation.json      — health claims, contested opinion, repeat posters
  threats-and-violence.json — specific threats, venting hyperbole, glorification
```

Each scenario has `postText`, `perspectiveScore` (illustrative — the agent calls the API itself), `expectedSkill`, and `expectedAction` — concrete inputs that yield traceable, verifiable outputs.

Scenario `h-4` in `harassment.json` is specifically designed to demonstrate non-linear tool use: the post appears to be harassment, but `get_reporter_history` reveals the reporter is filing retaliatory reports. The agent pivots mid-investigation and dismisses. The `agenticNote` field on that scenario traces the expected reasoning chain.

---

## Skills

Skills are in the `skills/` directory. Each skill is a folder with a `SKILL.md` file that gives the agent specific instructions for that category of violation. The router (Claude Haiku) reads all available skills and picks the best one for each incoming report.

| Skill | When it's used |
|---|---|
| `content-toxicity` | Hate speech, slurs, and explicitly toxic content |
| `harassment` | Targeted attacks on a specific user, repeated callouts, pile-ons, coordinated multi-user harassment |
| `misinformation` | False claims, health misinformation, deliberately misleading content |
| `threats-and-violence` | Explicit threats of physical harm, calls for violence |
