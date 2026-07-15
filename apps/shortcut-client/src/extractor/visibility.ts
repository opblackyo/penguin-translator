export function isElementVisible(element: Element, viewport = window): boolean {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);

  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < viewport.innerHeight &&
    rect.left < viewport.innerWidth
  );
}
