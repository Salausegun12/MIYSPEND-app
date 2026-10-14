import { File } from "expo-file-system";
import type { AttachmentExistence } from "./types";

/**
 * On-device existence checker backed by expo-file-system. A stored receipt
 * lives in the app's own document storage as a `file://` URI, so a plain
 * `File(uri).exists` answers whether the photo is still on the device. Any
 * error (bad URI, unreadable path) is treated as "missing" so the gallery
 * never renders a broken image. NOT exported from the barrel so tests stay on
 * the pure registry.
 */
export const expoAttachmentExistence: AttachmentExistence = {
  exists(uri: string): boolean {
    try {
      return new File(uri).exists;
    } catch {
      return false;
    }
  },
};