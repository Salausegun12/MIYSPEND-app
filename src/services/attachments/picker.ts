import { attachmentUnsupported } from "./responses";
import type {
  AttachmentError,
  AttachmentSource,
  PhotoPicker,
  PickedPhoto,
} from "./types";

/**
 * The picker used when no platform picker has been registered yet. It reports
 * itself as unavailable and rejects so callers surface the gentle
 * "not available" message instead of crashing.
 */
class UnavailablePhotoPicker implements PhotoPicker {
  readonly id = "unavailable";

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async pick(source: AttachmentSource): Promise<PickedPhoto | null> {
    throw {
      kind: "unsupported",
      message: attachmentUnsupported(source),
    } satisfies AttachmentError;
  }
}

export const unavailablePhotoPicker = new UnavailablePhotoPicker();

export type PhotoPickerResponder = (
  source: AttachmentSource
) => Promise<PickedPhoto | null> | PickedPhoto | null;

/** Test-facing view of the in-memory picker. */
export interface InMemoryPhotoPicker extends PhotoPicker {
  /** Every source the screen asked for, in order. */
  readonly requests: AttachmentSource[];
}

/**
 * A deterministic picker for tests and previews. It records requests and
 * returns whatever the supplied responder yields (a photo, or `null` for a
 * cancelled pick). The responder can also throw to simulate an error.
 */
export function createInMemoryPhotoPicker(
  responder: PhotoPickerResponder
): InMemoryPhotoPicker {
  const requests: AttachmentSource[] = [];

  return {
    id: "in-memory",
    requests,
    async isAvailable() {
      return true;
    },
    async pick(source) {
      requests.push(source);
      return responder(source);
    },
  };
}

let activePicker: PhotoPicker = unavailablePhotoPicker;

/**
 * Installs the picker the app should use. The native picker is registered at
 * startup by the attachment hook; until then picks report as unavailable.
 */
export function registerPhotoPicker(picker: PhotoPicker): void {
  activePicker = picker;
}

export function getPhotoPicker(): PhotoPicker {
  return activePicker;
}

export function resetPhotoPicker(): void {
  activePicker = unavailablePhotoPicker;
}
