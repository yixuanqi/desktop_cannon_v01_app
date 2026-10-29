// Both windows use physical screen coordinates via Rust at creation. Layout
// below expresses positions in CSS px (physical / scaleFactor) for WebView2.
export const CANNON_WINDOW = Object.freeze({ width: 360, height: 240 });
export const SPRITE = Object.freeze({ x: 39, y: 53, width: 214, height: 156,
  muzzleX: 39 + 214 * (130 / 480), muzzleY: 53 + 156 * (149 / 350),
  knobX: 39 + 214 * (397 / 480), knobY: 53 + 156 * (198 / 350) });
export function cannonPosition(workArea, scale = 1) {
  const marginX = 15 * scale; const marginBottom = 4 * scale;
  return {
    x: Math.round(workArea.x + workArea.width - CANNON_WINDOW.width * scale - marginX),
    y: Math.round(workArea.y + workArea.height - CANNON_WINDOW.height * scale - marginBottom),
  };
}
export function muzzleOnOverlay(layout) {
  return { x: layout.cannonX - layout.overlayX + SPRITE.muzzleX,
    y: layout.cannonY - layout.overlayY + SPRITE.muzzleY };
}
