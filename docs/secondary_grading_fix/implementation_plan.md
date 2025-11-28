# Secondary Grading Node Fix Implementation Plan

## Overview
This plan outlines the steps to fix the Secondary Grading node implementation, focusing on restoring missing functionality, improving type safety, and resolving Lint errors.

## Steps

### 1. Fix `secondary-grading.ts`
- **Restore `buildControls`**: The `buildControls` function was partially deleted. It needs to be restored to correctly render the UI controls for HSL keying and corrections.
- **Remove `any` types**: Replace `any` with specific types like `SecondaryGradingNodeSettings`, `ColorGradingPipeline`, etc.
- **Fix Import Order**: Ensure imports are ordered correctly (external libraries first, then internal types, then local modules).
- **Resolve Lint Errors**: Fix unused imports, missing type assertions, and other Lint warnings.

### 2. Fix `lut-loader.ts`
- **Remove `any` types**: Specifically in `getSourceMedia` where `settings` is cast to `any`.
- **Fix Import Order**: Align with the project's import sorting rules.

### 3. Fix `primary-grading.ts`
- **Remove `any` types**: In `getSourceMedia` and `updateValueAndPreview`.
- **Fix Import Order**: Align with the project's import sorting rules.
- **Resolve Lint Errors**: Fix `const` declarations and type assertions.

### 4. Fix `curve-editor.ts`
- **Remove `any` types**: In `getSourceMedia`.
- **Fix Import Order**: Align with the project's import sorting rules.

### 5. Documentation Update
- Update `docs/color_grading_system/task.md` to mark relevant tasks as completed.
