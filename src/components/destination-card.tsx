import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ArtName } from '@/art';
import { Art } from '@/components/ui/art';
import { Glass } from '@/components/ui/glass';
import { Text } from '@/components/ui/text';
import { shadows } from '@/constants/theme';

export type DestinationCardProps = {
  art: ArtName;
  name: string;
  meta: string;
  size?: 'hero' | 'half';
  tag?: string;
  action?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function DestinationCard({ art, name, meta, size = 'half', tag, action, onPress, style }: DestinationCardProps) {
  const hero = size === 'hero';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[hero ? styles.hero : styles.half, style]}>
      <View style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: hero ? 30 : 26 }]}>
        <Art name={art} />
      </View>
      {tag && (
        <Glass variant="dim" radius={16} style={styles.tag}>
          <Text variant="caption" weight="bold">
            {tag}
          </Text>
        </Glass>
      )}
      <Glass radius={hero ? 22 : 18} style={hero ? styles.heroCaption : styles.halfCaption}>
        <View style={styles.copy}>
          <Text variant={hero ? 'heading' : 'cardTitle'} style={!hero && styles.halfTitle}>
            {name}
          </Text>
          <Text variant={hero ? 'meta' : 'caption'} color="slate">
            {meta}
          </Text>
        </View>
        {action}
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { height: 300, borderRadius: 30, boxShadow: shadows.card },
  half: { flex: 1, height: 210, borderRadius: 26, boxShadow: shadows.cardSmall },
  clip: { overflow: 'hidden' },
  tag: {
    position: 'absolute',
    top: 14,
    left: 14,
    height: 32,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  heroCaption: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  halfCaption: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  copy: { flex: 1, gap: 2 },
  halfTitle: { fontSize: 15, lineHeight: 20 },
});
