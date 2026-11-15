import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ArtName } from '@/art';
import { Art } from '@/components/ui/art';
import { Glass } from '@/components/ui/glass';
import { Text } from '@/components/ui/text';
import { shadows, radius, space } from '@/constants/theme';

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
      <View style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius.card }]}>
        <Art name={art} />
      </View>
      {tag && (
        <Glass variant="dim" radius={radius.card} style={styles.tag}>
          <Text variant="caption" weight="bold">
            {tag}
          </Text>
        </Glass>
      )}
      <Glass radius={radius.card} style={hero ? styles.heroCaption : styles.halfCaption}>
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
  hero: { height: 300, borderRadius: radius.card, boxShadow: shadows.card },
  half: { flex: 1, height: 210, borderRadius: radius.card, boxShadow: shadows.cardSmall },
  clip: { overflow: 'hidden' },
  tag: {
    position: 'absolute',
    top: space.stack,
    left: space.stack,
    height: 32,
    paddingHorizontal: space.inset,
    justifyContent: 'center',
  },
  heroCaption: {
    position: 'absolute',
    left: space.stack,
    right: space.stack,
    bottom: space.stack,
    paddingVertical: space.inset,
    paddingLeft: space.inset,
    paddingRight: space.inset,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.stack,
  },
  halfCaption: {
    position: 'absolute',
    left: space.stack,
    right: space.stack,
    bottom: space.stack,
    paddingVertical: space.inset,
    paddingHorizontal: space.inset,
  },
  copy: { flex: 1, gap: space.fine },
  halfTitle: { fontSize: 15, lineHeight: 20 },
});
