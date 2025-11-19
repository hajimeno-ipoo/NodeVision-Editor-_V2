## 2025-11-19 Trim aspect fix redo step2
- Verified existing applyAspectConstraint pickCandidate logic already honors preferredAxis by immediately returning widthCandidate/heightCandidate, so no additional code change required beyond prior cleanup.
- Tests: reuse latest `pnpm test` run from Step1 confirmation (all green, jsdom DOMException logs only).