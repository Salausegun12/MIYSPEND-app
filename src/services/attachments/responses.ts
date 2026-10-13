import type { AttachmentSource } from "./types";

/**
 * Gentle, figure-free copy for attachment failures. Kept together so the
 * wording stays consistent everywhere a photo can be added or removed.
 */

function sourceName(source: AttachmentSource): string {
  return source === "camera" ? "camera" : "photo library";
}

export function attachmentPermissionDenied(source: AttachmentSource): string {
  return `MiySpend needs your permission to use the ${sourceName(
    source
  )}. You can turn it on in your phone settings, or save the expense without a photo.`;
}

export function attachmentUnsupported(source: AttachmentSource): string {
  return `The ${sourceName(
    source
  )} isn't available on this device. You can still save the expense without a photo.`;
}

export function attachmentStorageFailed(): string {
  return "I couldn't save that photo on your device. You can still save the expense without it.";
}

export function attachmentFailed(): string {
  return "I couldn't add that photo just now. You can try again or save the expense without it.";
}
