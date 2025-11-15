## 2025-11-16 Load node preview polish
- Updated node CSS to use object-fit: contain, darker background, no extra metadata rows so uploaded images/videos display fully (no top/bottom crop) and aspect text stands alone below preview.
- Removed size/type caption under preview, leaving only the filename pill and aspect label per user mock.
- `isInteractiveTarget` guard now prevents node drag handlers from catching clicks on any `data-node-interactive` elements.