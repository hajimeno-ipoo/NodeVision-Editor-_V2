## 2025-11-19 Trim aspect fix redo step1
- startResize now treats N/S handles as height-preferred and E/W handles as width-preferred, resetting lastPreferredAxis on each new drag; diagonals still infer axis from motion.
- Tests: `pnpm test` (Vitest full suite) succeeded with existing jsdom DOMException warnings only.