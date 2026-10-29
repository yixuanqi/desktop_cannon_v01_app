/** Calculate browser-preview iframe location, clamped to the parent viewport. */
export function dragFrameTo(start, pointerX, pointerY, viewportWidth, viewportHeight) {
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  return {
    x: clamp(start.left + pointerX - start.pointerX, 0, Math.max(0, viewportWidth - start.width)),
    y: clamp(start.top + pointerY - start.pointerY, 0, Math.max(0, viewportHeight - start.height)),
  };
}
