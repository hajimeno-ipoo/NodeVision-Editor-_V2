## Workflow name dialog (2025-11-16)
- Replaced the workflow rename/save-as prompts with a custom in-app modal (`#workflow-name-dialog`) so Electron’s lack of `window.prompt` isn’t a blocker.
- Added DOM references, CSS, and localized strings for the dialog; renderer logic now awaits the modal result before saving or renaming workflows.
- Menu buttons wire into the async handlers, and Esc/click-outside cancels cleanly while Enter submits the name.