## 2025-11-19 Trim crop step2
- Restyled `.trim-crop-box` + handles inside apps/desktop-electron/src/ui-template.ts to mimic Affinity: thin white frame, rounded corners, soft shadow, and embedded `.trim-crop-grid` thirds lines with per-line positioning.
- Handles now square/rounded bars with expanded hitboxes via ::before, prepared for future dataset-based opacity tweaks.
- Ran `pnpm test` again; vitest suite green with existing jsdom DOMException logs only.