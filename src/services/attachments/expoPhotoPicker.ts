import * as ImagePicker from "expo-image-picker";
import { attachmentPermissionDenied } from "./responses";
import type {
  AttachmentError,
  AttachmentSource,
  PhotoPicker,
  PickedPhoto,
} from "./types";

/**
 * On-device camera and photo-library picker. The selected photo stays a
 * temporary file until the app's attachment store copies it into private
 * storage; this adapter never uploads anything.
 *
 * Kept out of the attachments barrel (alongside the other Expo adapters) so
 * the pure service layer stays importable under Node.
 */
class ExpoPhotoPicker implements PhotoPicker {
  readonly id = "expo-image-picker";

  async isAvailable(_source: AttachmentSource): Promise<boolean> {
    return true;
  }

  async pick(source: AttachmentSource): Promise<PickedPhoto | null> {
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw {
          kind: "permission-denied",
          message: attachmentPermissionDenied(source),
        } satisfies AttachmentError;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.7,
      });
      return toPickedPhoto(result);
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw {
        kind: "permission-denied",
        message: attachmentPermissionDenied(source),
      } satisfies AttachmentError;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    return toPickedPhoto(result);
  }
}

function toPickedPhoto(result: ImagePicker.ImagePickerResult): PickedPhoto | null {
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? null,
    mimeType: asset.mimeType ?? null,
  };
}

export const expoPhotoPicker = new ExpoPhotoPicker();
