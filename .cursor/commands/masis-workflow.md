# Masis Jira-driven workflow

Invocation: `/masis-workflow MASIS-123 refine` or `/masis-workflow MASIS-123 deliver`

Use the supplied MASIS issue key and requested mode. If either is missing, ask only for that missing parameter. Apply `.cursor/rules/masis-delivery.mdc` and existing repository rules. If this command and the always-on rule `.cursor/rules/masis-delivery.mdc` disagree, stop and report the contradiction. Do not select the less restrictive instruction. Read the latest DoR and DoD via Atlassian MCP:
- DoR: https://masis-app.atlassian.net/wiki/spaces/MASIS/pages/327681/Masis+Definition+of+Ready
- DoD: https://masis-app.atlassian.net/wiki/spaces/MASIS/pages/524289/Masis+Definition+of+Done

**Exact Jira completion status:** `Resolved` (ID `5`) is mapped to the board column named `Done`. The Definition of Done describes the evidence required before a transition to `Resolved`. There is no separate Jira status named `Done`; never try to transition to one.

Any code or configuration edit requires an existing MASIS issue key. If no issue key is present, stop before writing or editing files and ask for the issue key or for refinement. Do not infer an issue key from a branch name, commit message, or chat topic. Read-only inspection, explanation, and design discussion do not require an issue. Proposing text for approval is allowed; applying it is not. An expedited exception still requires a recorded MASIS issue and explicit user approval on that issue before editing begins; the issue must record the urgency and the specific readiness steps waived. It may waive only those specified Definition of Ready requirements. It does not bypass Jira workflow restrictions, issue tracking, independent review, required testing, commit, merge, or deployment approvals, release authorisation, or sprint controls.

## Step 1: Load and verify facts (both modes)

1. Read the *existing* Jira issue using Atlassian MCP. Confirm project MASIS, type, status, description, acceptance criteria, decisions and related links. Do not create a duplicate issue. A project/branch/issue key guess is not evidence.
2. Read current canonical Confluence policies. If Jira or Confluence MCP is unreachable, or required approval or readiness evidence cannot be read, stop before any code or configuration edit and before any status change; do not claim any gate has passed.
3. Inspect the current implementation and relevant feature contracts. Explicitly assess all four repositories: lifepilot, lifepilot-apple, openGym (Masis `lifepilot-integration` branch) and lifepilot-website. If a repository is inaccessible, mark unverified; do not infer unaffected.
4. Identify cross-repository dependencies, profile/data ownership, HealthKit/device risks, migration risks and verification scope where applicable.

## Mode: refine

5. Prepare a concise Jira **Readiness Assessment** with one row each for DoR criteria: Verified (with evidence), N/A (with rationale), or Outstanding (with missing information). For a bug, a known root cause is NOT required for DoR.
6. Propose technical solution, alternatives, tests, risks and scope questions; do not edit code or configuration in refine mode.
7. Save the findings to the existing Jira issue using MCP without overwriting product intent. Where MCP supports comments, append a dated readiness summary; otherwise propose the exact text for manual pasting.
8. Recommend Ready *only* when every applicable gate is supported by evidence. Do not move it automatically or assign to sprint without user approval. Report the one next action or blocker.

## Mode: deliver

5. **Phase gate.** Use the same rules as `.cursor/rules/masis-delivery.mdc`. Before every code or configuration edit, classify Jira status. Approved product requirements and current policy access remain required. A status name alone is not evidence.
   - **Ready is initiation.** The issue must currently be Ready. The current Definition of Ready is readable. The readiness assessment must mark each applicable criterion Verified, N/A with rationale, or explicitly waived under an existing, user-approved expedited exception recorded on that MASIS issue. Any Outstanding criterion not explicitly waived still blocks delivery. The user has explicitly authorised starting delivery. With that authorisation, transition from Ready to In Progress and read the status back before any edit. Ready alone is not permission to edit. An expedited exception does not bypass Jira workflow restrictions. The Ready -> In Progress transition and status read-back remain mandatory before editing. If evidence is missing, stop before editing and offer refine.
   - **In Progress is continuation.** Retrieve Jira changelog or history evidence and confirm the issue previously reached Ready. Continue only when that history is complete and shows Ready was reached, the approved readiness assessment and acceptance criteria still apply, and there is no unresolved material scope change. This includes rework after Review and Test once the user has approved the return to In Progress. If the necessary history is incomplete or unavailable, or policies cannot be read, stop.
   - **Review and Test is review only.** Do not edit code or configuration. Record findings. Rework requires the user's approval to return to In Progress; the continuation rule then applies.
   - **Backlog, Refinement, Resolved, and any other status stop the edit.** Backlog and Refinement use refine. Resolved is closed. Do not weaken these gates.
   - An expedited exception may waive only the readiness steps already recorded on that same issue, including the user's approval, the urgency, and the waived steps. It does not bypass Jira workflow restrictions, issue tracking, independent review, required testing, commit, merge, or deployment approvals, release authorisation, or sprint controls; it does not allow edits during Review and Test or reopen Resolved.
6. Create a bounded implementation plan grounded in current code; preserve approved intent and existing contracts. Obtain approval for material changes.
7. Implement only in affected repositories, respecting original branches and separate repository rules. Run focused and relevant broader automated verification, then independent fresh-context review. Record real results, not anticipated results.
8. Perform applicable manual/device verification (including real iPhone/Apple Watch when required) or explicitly mark blocked. Update canonical feature documentation plus affected repo docs, keeping intent and actual implementation distinct.
9. Post a **Delivery Evidence** summary on the existing Jira issue: acceptance criteria with evidence; per-repo affected/unaffected/unverified matrix; build/test commands and results; independent review link and findings; device/manual checks; PR/commit references; documentation links; risks and follow-ups.
10. Only recommend transitioning to **Resolved** after reading current DoD and checking every applicable criterion. Never transition to Resolved on unverified assertions. Any status transition needs user permission and supporting evidence. Completion in Jira does not authorise a production, TestFlight or public website release.
11. Return a concise report: implementation summary, verified results, unresolved blockers, Jira status, and one next action.

## Fail-closed requirements

**Pre-edit (Definition of Ready and phase gates):** If no MASIS issue key is available, Jira or Confluence MCP cannot connect, or required approval or readiness evidence cannot be read, or prior Ready cannot be verified from Jira changelog or history for an In Progress continuation, make the missing evidence visible. Stop before code or configuration edits and before Jira status changes that would start or continue delivery without evidence. Do not claim readiness has passed.

**Before Resolved (Definition of Done):** Missing or incomplete required testing, independent review, or other applicable DoD evidence blocks recommending or performing a transition to **Resolved** and blocks claiming completion. It does not block otherwise authorised implementation or rework while the issue is **In Progress**, including an approved return from Review and Test.

Do not fabricate a review, hardware test, CI outcome or repository inspection. Follow any stricter existing rules for commits, merges and deployment.
