import React, { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import type { GalleryPhoto } from "../../services/gallery";

interface PhotoTileProps {
  photo: GalleryPhoto;
  /** Square edge length in px. */
  size: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/**
 * A square receipt thumbnail. If the file is missing after all (for example it
 * was cleared by the OS) the tile falls back to a quiet placeholder instead of
 * a broken image.
 */
export function PhotoTile({
  photo,
  size,
  onPress,
  accessibilityLabel,
}: PhotoTileProps) {
  const [broken, setBroken] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { width: size, height: size },
        pressed && styles.tilePressed,
      ]}
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel ?? `${photo.description} photo`}
    >
      {broken ? (
        <View style={[styles.tile, styles.broken, { width: size, height: size }]}>
          <Ionicons
            name="image-outline"
            size={Math.round(size * 0.32)}
            color={Colors.textTertiary}
          />
        </View>
      ) : (
        <Image
          source={{ uri: photo.uri }}
          style={[styles.tile, { width: size, height: size }]}
          resizeMode="cover"
          onError={() => setBroken(true)}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  tilePressed: {
    opacity: 0.75,
  },
  broken: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.borderLight,
  },
});