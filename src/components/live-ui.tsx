import { ConvexError } from 'convex/values';
import { Image } from 'expo-image';
import { openURL } from 'expo-linking';
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

export function errorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === 'object' && error.data !== null && 'message' in error.data) {
    return String(error.data.message);
  }
  return 'Something went wrong. Check your connection and try again.';
}

export function Notice({ children }: { children: ReactNode }) {
  return <Text variant="bodySmall" color="muted" accessibilityLiveRegion="polite">{children}</Text>;
}

export function AsyncButton({ label, onPress, variant = 'primary', disabled = false }: {
  label: string;
  onPress: () => Promise<unknown>;
  variant?: 'primary' | 'secondary' | 'link';
  disabled?: boolean;
}) {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return (
    <View style={styles.action}>
      <Button label={pending ? 'Working…' : label} variant={variant} disabled={disabled || pending} onPress={async () => {
        if (locked.current) return;
        locked.current = true;
        setPending(true);
        setError('');
        try { await onPress(); } catch (cause) { setError(errorMessage(cause)); }
        finally { locked.current = false; setPending(false); }
      }} />
      {!!error && <Notice>{error}</Notice>}
    </View>
  );
}

export type PlaceImage = { url: string; credit: string; license: string; sourceUrl: string };

export function PlaceArt({ place, height = 140 }: { place?: { _id: string; image: PlaceImage | null }; height?: number }) {
  return (
    <View style={[styles.art, { height }]} accessible={false}>
      {place?.image && (
        <Image
          source={{ uri: place.image.url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          recyclingKey={place._id}
          cachePolicy="disk"
        />
      )}
    </View>
  );
}

export function PhotoCredit({ image }: { image: PlaceImage | null }) {
  if (!image) return null;
  return (
    <Text
      variant="caption"
      color="muted"
      numberOfLines={1}
      accessibilityRole="link"
      accessibilityHint="Opens the photo on Wikimedia Commons"
      onPress={() => openURL(image.sourceUrl)}
      style={styles.credit}>
      Photo: {image.credit}{image.license ? ` · ${image.license}` : ''}
    </Text>
  );
}

const styles = StyleSheet.create({
  action: { gap: 6 },
  art: { borderRadius: 22, overflow: 'hidden', backgroundColor: '#DCE6EB' },
  credit: { marginTop: -4, paddingHorizontal: 4 },
});
