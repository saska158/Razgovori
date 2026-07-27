# Multi-Target Moderation Agent — Upgrade Design

## Problem with the current approach

The current agentic loop is not genuinely agentic. The agent calls a roughly fixed set of context tools (perspective score, post, comments, user history, violations, reporter history) and then makes a single decision. This pipeline is predictable enough to be written as a single LLM call with all context pre-fetched — the loop adds complexity without earning it.

An agentic loop is justified only when the **next step depends on what was discovered in the previous step** and the investigation path cannot be known in advance.

---

## Two investigation directions

There are two directions the agent can expand its scope, and they are not mutually exclusive.

### Direction A: follow the perpetrator

The reported user has other posts up with the same violation pattern, or has been targeting multiple victims across the platform. The agent discovers more posts from the same bad actor.

- Tools: `get_cross_reports`, `get_posts_by_user_in_room`, `remove_additional_post` *(implemented)*
- Identifies: repeat offenders, serial harassers, spammers

### Direction B: follow the victim

The reported post is not an isolated attack — multiple different users are all targeting the same person. Individual posts may be borderline, but together they form coordinated harassment.

- Tool: `get_posts_targeting_victim` *(implemented)*

- Identifies: pile-ons, coordinated bullying, group targeting campaigns

The victim is identified as `report.reporterUid` (the person who filed the report). The app stores `mentionedUids[]` on every post, so Firestore can query this directly with `array-contains`.

**`get_posts_targeting_victim` returns:**
- All posts across all rooms that mention the victim
- `uniquePerpetratorCount` — how many different users are involved
- `postsInLast1h`, `postsInLast24h` — timing signals
- `coordinationSignal`: `low` / `medium` / `high` based on recency and perpetrator count

Both directions justify the agentic loop because the scope of the investigation cannot be known upfront.

---

## Status

### Done

| What | Where |
|---|---|
| `get_posts_targeting_victim(victim_uid)` — Direction B tool | `server/tools.js` |
| `get_cross_reports(uid)` — Direction A context tool | `server/tools.js` |
| `get_posts_by_user_in_room(uid, room)` — Direction A context tool | `server/tools.js` |
| `remove_additional_post(room, post_id, uid, reasoning)` — accumulating action | `server/tools.js` |
| `ACCUMULATING_TOOLS` set — loop continues after `remove_additional_post` | `server/agent.js` |
| `additionalRemovals[]` tracking — surfaced in verification prompt and final emit | `server/agent.js` |
| Harassment skill updated with perpetrator-axis and victim-axis guidance | `server/skills/harassment/SKILL.md` |
| App stores `mentionedUids[]` on every post (required for Direction B query) | `src/api/sendPostToFirestore.js` |

---

## Resulting agent behavior

| Scenario | Before | After |
|---|---|---|
| Single heated post, first offense | Gather context → warn | Same |
| Clear violation, no history | Gather context → remove | Same |
| Harassment report, victim targeted by multiple users | Dismiss or warn (no visibility) | `get_posts_targeting_victim` → act on full scope |
| Coordinated pile-on, high coordination signal | No detection | Detect, remove posts, escalate repeat perpetrators |
| Clear violation, pattern across perpetrator's own posts | Remove reported post only | `get_posts_by_user_in_room` → `remove_additional_post` per bad post → finalize |
| Repeat offender confirmed by multiple reporters | Act on reported post only | `get_cross_reports` reveals scope → escalate appropriately |
