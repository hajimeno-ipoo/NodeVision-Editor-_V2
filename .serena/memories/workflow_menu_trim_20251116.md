## Workflow menu trim (2025-11-16)
- Removed duplicate/save/delete actions from the workflow dropdown per request; menu now only exposes rename, save-as, clear, and browse.
- Renderer DOM capture + translations updated to match, and menu logic reverted to explicit listeners for each remaining button to ensure reliable clicks.
- Sidebar "Save current workflow" button still uses the internal save handler; deletion of workflows is no longer exposed in the UI.