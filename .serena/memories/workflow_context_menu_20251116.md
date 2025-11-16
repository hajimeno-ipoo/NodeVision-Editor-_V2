## Workflow context menu (2025-11-16)
- Added a custom right-click context menu for workflow entries in the sidebar; the menu currently exposes only "Delete workflow" per user request.
- Context menu lives in ui-template with new CSS, translations, and DOM bindings; renderer tracks menu state/target, positions it near the pointer, and closes on outside click or Escape.
- Deleting from the context menu reuses the existing confirm prompt, updates localStorage, and resets the active workflow if the deleted entry was loaded.