# Masis Jira-driven workflow

Invocation: `/masis-workflow MASIS-123 refine` or `/masis-workflow MASIS-123 deliver`

Use the supplied MASIS issue key and requested mode. If either is missing, ask only for that missing parameter. Apply `.cursor/rules/masis-delivery.mdc` and existing repository rules. Read the latest DoR and DoD via Atlassian MCP:
- DoR: https://masis-app.atlassian.net/wiki/spaces/MASIS/pages/327681/Masis+Definition+of+Ready
- DoD: https://masis-app.atlassian.net/wiki/spaces/MASIS/pages/524289/Masis+Definition+of+Done

## Step 1: Load and verify facts (both modes)

1. Read the *existing* Jira issue using Atlassian MCP. Confirm project MASIS, type, status, description, acceptance criteria, decisions and related links. Do not create a duplicate issue. A project/branch/issue key guess is not evidence.
2. Read current canonical Confluence policies. If unreachable, stop before claiming any gate has passed.
3. Inspect the current implementation and relevant feature contracts. Explicitly assess all four repositories: lifepilot, lifepilot-apple, openGym (Masis `lifepilot-integration` branch) and lifepilot-website. If a repository is inaccessible, mark unverified; do not infer unaffected.
4. Identify cross-repository dependencies, profile/data ownership, HealthKit/device risks, migration risks and verification scope where applicable.

## Mode: refine

5. Prepare a concise Jira **Readiness Assessment** with one row each for DoR criteria: Verified (with evidence), N/A (with rationale), or Outstanding (with missing information). For a bug, a known root cause is NOT required for DoR.
6. Propose technical solution, alternatives, tests, risks and scope questions; do not edit product code in refine mode.
7. Save the findings to the existing Jira issue using MCP without overwriting product intent. Where MCP supports comments, append a dated readiness summary; otherwise propose the exact text for manual pasting.
8. Recommend Ready *only* when every applicable gate is supported by evidence. Do not move it automatically or assign to sprint without user approval. Report the one next action or blocker.

## Mode: deliver

5. **Hard preflight:** Require status Ready, approved product requirements, current policy access, completed and evidenced DoR, and no unresolved blocking questions. If any missing, stop **before editing product code**; report missing criteria and offer to run refine instead. An expedited exception requires explicit user authorisation recorded on the issue.
6. Create a bounded implementation plan grounded in current code; preserve approved intent and existing contracts. Obtain approval for material changes.
7. Implement only in affected repositories, respecting original branches and separate repository rules. Run focused and relevant broader automated verification, then independent fresh-context review. Record real results, not anticipated results.
8. Perform applicable manual/device verification (including real iPhone/Apple Watch when required) or explicitly mark blocked. Update canonical feature documentation plus affected repo docs, keeping intent and actual implementation distinct.
9. Post a **Delivery Evidence** summary on the existing Jira issue: acceptance criteria with evidence; per-repo affected/unaffected/unverified matrix; build/test commands and results; independent review link and findings; device/manual checks; PR/commit references; documentation links; risks and follow-ups.
10. Only recommend Done after reading current DoD and checking every applicable criterion. Never mark Done on unverified assertions. Any status transition needs user permission and supporting evidence. Done does not authorise a production, TestFlight or public website release.
11. Return a concise report: implementation summary, verified results, unresolved blockers, Jira status, and one next action.

## Fail-closed requirements

If Jira/Confluence MCP cannot connect, or access/approval/test evidence is missing, do not claim readiness/completion or change status. Do not fabricate a review, hardware test, CI outcome or repository inspection. Follow any stricter existing rules for commits, merges and deployment.
