export const IMAGE_ID_ATTRIBUTE = "data-penguin-translator-image-id";

const IMAGE_ID_PREFIX = "penguin-image-";
let fallbackSequence = 0;

function createCandidateId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${IMAGE_ID_PREFIX}${globalThis.crypto.randomUUID()}`;
  }

  fallbackSequence += 1;
  return `${IMAGE_ID_PREFIX}${Date.now().toString(36)}-${fallbackSequence.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function findImageByClientId(clientImageId: string): HTMLImageElement | undefined {
  return Array.from(document.querySelectorAll<HTMLImageElement>(`img[${IMAGE_ID_ATTRIBUTE}]`)).find(
    (image) => image.getAttribute(IMAGE_ID_ATTRIBUTE) === clientImageId,
  );
}

export function ensureImageClientId(image: HTMLImageElement): string {
  const existing = image.getAttribute(IMAGE_ID_ATTRIBUTE);
  if (existing) {
    return existing;
  }

  let candidate = createCandidateId();
  while (findImageByClientId(candidate)) {
    candidate = createCandidateId();
  }
  image.setAttribute(IMAGE_ID_ATTRIBUTE, candidate);
  return candidate;
}
