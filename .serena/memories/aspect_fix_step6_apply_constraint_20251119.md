## 2025-11-19 Trim crop aspect fix – step 6 (applyAspectConstraint)
- Rebuilt applyAspectConstraint so it now performs all math in normalized image space, picking between width-anchored and height-anchored candidates before doing a single conversion back to stage coordinates.
- Removed the old projectCandidate projection + reconversion loop that mixed stage/image units and produced ~0.47 ratio drift under letterbox conditions.
- Added lightweight helpers to compare ratio error and detect boundary touches while still honoring preferredAxis forcing rules.