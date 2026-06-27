# Manual UX test log

Every end-to-end WhatsApp test run goes here as `test-NNN.md`. The goal is to capture the actual WhatsApp transcript, what was wrong, what we changed in response, and whether the next test confirmed the fix.

## File naming

- `test-001.md`, `test-002.md`, ... (zero-padded, monotonic)
- One file per test session. If you re-run after fixes, that's a new file with a back-reference.

## Template

```
# Test NNN — short title

**Date:** YYYY-MM-DD
**Tester:** Mayank
**Phase:** Onboarding / Photo flow / Style picker / Delivery / Edit / Payment
**Build SHA:** <git rev-parse HEAD>
**Previous test:** test-NNN.md (if applicable)

## What was tested
Short paragraph: scenario, returning vs new user, what the tester was trying to verify.

## Transcript
Verbatim WhatsApp transcript, timestamped.

## Issues found
Numbered. Each issue gets:
- Severity (blocker / major / minor / polish)
- Repro: which message in the transcript
- Root cause (file:line if known)
- Proposed fix

## Action items
Checklist of what we agreed to change in code.

## Next test
What to re-test after fixes land. Link to test-(NNN+1).md when it exists.
```
