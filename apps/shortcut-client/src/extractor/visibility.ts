export type VisibilityRejectionReason =
  | "CSS_DISPLAY_NONE"
  | "CSS_VISIBILITY_HIDDEN"
  | "CSS_OPACITY_ZERO"
  | "RENDERED_WIDTH_ZERO"
  | "RENDERED_HEIGHT_ZERO"
  | "OUTSIDE_VIEWPORT_ABOVE"
  | "OUTSIDE_VIEWPORT_LEFT"
  | "OUTSIDE_VIEWPORT_BELOW"
  | "OUTSIDE_VIEWPORT_RIGHT";

export function getVisibilityRejectionReasons(
  element: Element,
  rect = element.getBoundingClientRect(),
  viewport = window,
  requireViewportIntersection = true,
): VisibilityRejectionReason[] {
  const style = getComputedStyle(element);
  const reasons: VisibilityRejectionReason[] = [];

  if (style.display === "none") {
    reasons.push("CSS_DISPLAY_NONE");
  }
  if (style.visibility === "hidden") {
    reasons.push("CSS_VISIBILITY_HIDDEN");
  }
  if (style.opacity === "0") {
    reasons.push("CSS_OPACITY_ZERO");
  }
  if (rect.width <= 0) {
    reasons.push("RENDERED_WIDTH_ZERO");
  }
  if (rect.height <= 0) {
    reasons.push("RENDERED_HEIGHT_ZERO");
  }
  if (requireViewportIntersection) {
    if (rect.bottom <= 0) {
      reasons.push("OUTSIDE_VIEWPORT_ABOVE");
    }
    if (rect.right <= 0) {
      reasons.push("OUTSIDE_VIEWPORT_LEFT");
    }
    if (rect.top >= viewport.innerHeight) {
      reasons.push("OUTSIDE_VIEWPORT_BELOW");
    }
    if (rect.left >= viewport.innerWidth) {
      reasons.push("OUTSIDE_VIEWPORT_RIGHT");
    }
  }

  return reasons;
}

export function isElementVisible(element: Element, viewport = window): boolean {
  return (
    getVisibilityRejectionReasons(element, element.getBoundingClientRect(), viewport).length === 0
  );
}
