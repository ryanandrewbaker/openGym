# Masis Jira-driven workflow

Invocation: `/masis-workflow MASIS-123 discover` or `/masis-workflow MASIS-123 deliver`

Use the supplied MASIS issue key and requested mode. If either is missing, ask only for that missing parameter. Apply `.cursor/rules/masis-delivery.mdc` and existing repository rules. If this command and the always-on rule disagree, stop and report the contradiction. Do not select the less restrictive instruction.

**There is no `refine` mode.** Refinement, DoR completion and transition to Ready are owned by the user, ChatGPT or another designated tool—not Cursor.

Read the latest DoR and DoD via Atlassian MCP:

- DoR: https://masis-app.atlassian.net/wiki/spaces/MASIS/pages/327681/Masis+Definition+of+Ready
- DoD: https://masis-app.atlassian.net/wiki/spaces/MASIS/pages/524289/Masis+Definition+of+Done

**Exact Jira completion status:** `Resolved` (ID `5`) is mapped to the board column named `Done`. Cursor must **never** transition to `Resolved`. Only the user in Jira or ChatGPT on explicit recorded instruction may close an issue.

Any code or configuration edit requires an existing MASIS issue key. Read-only inspection, explanation, and design discussion do not require an issue. Proposing text for approval is allowed; applying it is not.

An expedited exception still requires a recorded MASIS issue and explicit user approval on that issue before editing begins. The issue must record the urgency and the specific readiness steps waived. It may waive only specified Definition of Ready requirements. Any applicable DoR criterion still **Outstanding** and not explicitly waived on the issue still blocks delivery. It does **not** bypass Epic-at-creation, active sprint, Jira-comment approvals, permitted transitions, independent review, review-stage merging, merge/deployment authorisation, verification, or human/ChatGPT-only closure.

## Step 1: Load and verify facts (both modes)

1. Read the *existing* Jira issue using Atlassian MCP. Confirm project MASIS, type, status, Epic parent (required for Stories), **active** sprint membership, description, acceptance criteria, decisions and related links. Do not create a duplicate issue.
2. Read current canonical Confluence policies. If Jira or Confluence MCP is unreachable, or required approval or readiness evidence cannot be read, stop before any code or configuration edit and before any status change.
3. Inspect the current implementation and relevant feature contracts. Explicitly assess all four repositories: lifepilot, lifepilot-apple, openGym (Masis `lifepilot-integration` branch) and lifepilot-website. Mark inaccessible repos unverified.
4. Identify cross-repository dependencies, profile/data ownership, HealthKit/device risks, migration risks and verification scope where applicable.
5. If the sprint is not **active**, stop delivery actions (edits, merges, deployment, delivery transitions). Read-only discovery may continue when requested.
6. **Resumed session:** When continuing work on the supplied issue, read the latest **Session Handover** on the issue, verify the maintained **intended sprint outcome**, **current state** and **next action**, the authoritative description and acceptance criteria, and local `git status` in affected repositories before acting. Preserve unrelated uncommitted work (isolated branches/worktrees when needed).

## Story-specific technical refinement gate (MASIS-22)

When `discover` or `deliver` is invoked **for a specific MASIS issue** and the work is **Story-specific technical refinement** (typically while the issue is in **Refinement**):

1. Verify a Jira comment records explicit user confirmation that product refinement is complete or written requirements are satisfactory (DoR templates). **No confirmation = stop** Story-specific technical refinement; return findings to user/ChatGPT.
2. That confirmation permits **technical refinement only**—not Ready, implementation, commit/push, merge or deploy.
3. **Does not apply** to general read-only repository browsing, explanation or design discussion unrelated to a Story's technical refinement pass.

## Jira comment approval verification (deliver mode and transitions)

Before Ready → In Progress, In Progress → Review and Test, Review and Test → In Progress (rework), merge, commit/push (when required), deployment, or closure:

1. List Jira comments on the issue.
2. Find a comment **before now** that explicitly authorises the **exact** action, scope, branch/PR and deployment implications.
3. Reject status-only, agent-generated, stale or scope-mismatched approvals.
4. After an authorised Jira transition, read back issue status before edits.

Cursor may append a comment faithfully recording user approval obtained in chat; it must not invent approval.

## Mode: discover (read-only)

Use only when the user or ChatGPT explicitly requests technical discovery input for refinement—not for Cursor to own refinement.

Apply the **Story-specific technical refinement gate** when the discovery is for a Story in technical refinement.

5. Inspect code, configuration, contracts, branches and deployment scripts read-only across affected repositories.
6. Summarise findings, risks, repository impact, feasible enforcement and open questions **for the requirements owner**. Include a proposed **story-point estimate** and **confidence** for user/ChatGPT to record in Jira before Ready (prefer 1–3 points; review 5 for splitting; split or spike 8+).
7. **Do not** edit code or configuration, update DoR assessments as authoritative readiness, recommend or perform transition to Ready, assign sprints, or change Jira status (except as explicitly authorised elsewhere).
8. Return findings to the user/ChatGPT for inclusion in Jira; do not treat this output as approved product intent until recorded on the issue.
9. When the session ends after Story-specific discovery on an active-sprint **Story**, **must** append a **Session Handover** to the issue (DoR template), including maintained **intended sprint outcome**, **current state** and **one next action**.

## Mode: deliver

5. **Phase gate.** Classify Jira status and sprint per `.cursor/rules/masis-delivery.mdc`:
   - **Ready → In Progress:** Ready status, active sprint, Story Epic parent, readable DoR, Jira comment authorising implementation start, then transition and read-back. Expedited waivers apply only to steps explicitly recorded with user approval; unwaived Outstanding DoR criteria still block delivery.
   - **In Progress:** History shows Ready was reached; active sprint; approved baseline; Jira comments for commits/pushes when required. After Review and Test, require a Jira-comment authorising **Review and Test → In Progress** before rework edits. Implement and prepare PRs; **do not merge**.
   - **In Progress → Review and Test:** Separate Jira comment authorising the transition after implementation is ready for review.
   - **Review and Test:** No implementation edits. Independent fresh-context review; separate Jira-comment approval per PR merge; merge only to the authorised production source branch; verify integrated/deployed behaviour; record evidence.
   - **Backlog, Refinement, Resolved:** Stop edits. Rework to In Progress requires user/ChatGPT authorisation in Jira comments—not Cursor.
6. Create a bounded implementation plan grounded in current code; preserve approved intent. Obtain approval for material changes.
7. Implement only in affected repositories on the correct branches. Run focused automated verification; arrange independent fresh-context review for substantive changes.
8. Perform applicable manual, simulator or device verification (including real iPhone/Apple Watch when required) or explicitly mark blocked. Do not claim physical device, simulator, HealthKit, GPS, WatchConnectivity or manual UI verification unless it was actually performed. Update canonical feature documentation where required.
9. Post **Delivery Evidence** on the Jira issue: acceptance criteria mapping; per-repo matrix; commands and real results; review outcome; PR references; documentation; risks.
10. **Never** transition to Resolved. May recommend closure to user/ChatGPT when DoD evidence is complete.
11. Return a concise report: summary, verified results, blockers, Jira status, enforcement limits, and the one next action requiring separate approval.
12. **Session Handover:** At the end of **every** deliver session on an active-sprint **Story**, **must** append a concise handover comment (DoR template): maintained intended sprint outcome, current state and next action; completed work; remaining work; decisions/blockers; branches/PRs/commits and verification actually performed. Do not claim tests or devices not used. **Does not apply** to general read-only repository browsing without a Story-focused governed session.

## Fail-closed requirements

**Pre-edit:** Missing key, inactive sprint (for delivery), Story without Epic, missing/invalid approval comment, inaccessible MCP, unwaived Outstanding DoR criteria, or unverified Ready history blocks edits and unauthorised transitions.

**Merge:** Only in Review and Test with per-PR Jira-comment merge approval acknowledging deployment consequences.

**Closure:** Cursor never transitions to Resolved.

Do not fabricate a review, hardware test, CI outcome or repository inspection. Follow stricter repository rules for commits, merges and deployment.
