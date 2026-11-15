import { ConvexError } from 'convex/values';
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ArtName } from '@/art';
import { Art } from '@/components/ui/art';
import { Button } from '@/components/ui/button';
import type { IconName } from '@/components/ui/icon';
import { IconButton, type IconButtonProps } from '@/components/ui/icon-button';
import { BrandLogo } from '@/components/brand-logo';
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

const artwork: Record<string, ArtName> = {
  'Paris|FR': 'tileParis', 'Tokyo|JP': 'tileTokyo', 'Rome|IT': 'tileRome', 'New York City|US': 'tileNewYork',
  'Reykjavík|IS': 'tileReykjavik', 'Lisbon|PT': 'tileLisbon', 'Kyoto|JP': 'kyotoCard',
  'Porto|PT': 'porto', 'Cappadocia|TR': 'cappadocia', 'Hallstatt|AT': 'hallstatt',
};

export function PlaceArt({ place, height = 140 }: { place?: { name: string; countryCode: string }; height?: number }) {
  const name = place ? artwork[`${place.name}|${place.countryCode}`] : undefined;
  return (
    <View style={[styles.art, { height }]} accessible={false}>
      {name ? <Art name={name} /> : <BrandLogo symbol height={32} decorative />}
    </View>
  );
}

const styles = StyleSheet.create({
  action: { gap: space.inline },
  art: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
