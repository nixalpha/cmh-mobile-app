import { ConvexError } from 'convex/values';
import { Image } from 'expo-image';
import { openURL } from 'expo-linking';
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import type { IconName } from '@/components/ui/icon';
import { IconButton, type IconButtonProps } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';

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

// Compact action: an icon with an accessible label. Errors go to onError so the
// caller can show them where they fit instead of under the icon.
export function AsyncIconButton({ icon, label, onPress, onError, variant = 'glass', size, selected, disabled = false }: {
  icon: IconName;
  label: string;
  onPress: () => Promise<unknown>;
  onError?: (message: string) => void;
  variant?: IconButtonProps['variant'];
  size?: number;
  selected?: boolean;
  disabled?: boolean;
}) {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  return (
    <IconButton
      icon={icon}
      label={label}
      variant={variant}
      size={size}
      selected={selected}
      disabled={disabled || pending}
      onPress={async () => {
        if (locked.current) return;
        locked.current = true;
        setPending(true);
        try { await onPress(); } catch (cause) { onError?.(errorMessage(cause)); }
        finally { locked.current = false; setPending(false); }
      }}
    />
  );
}

export function PlaceArt({ place, height = 140 }: { place?: { _id: string; image: PlaceImage | null }; height?: number }) {
  return (
    <View style={[styles.art, { height }]} accessible={false}>
      {place?.image ? (
        <Image
          source={{ uri: place.image.url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          recyclingKey={place._id}
          cachePolicy="disk"
        />
      ) : <BrandLogo symbol height={32} decorative />}
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
  action: { gap: space.inline },
  art: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  credit: { marginTop: -4, paddingHorizontal: space.inline },
});
