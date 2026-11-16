import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';

export function StatTile({ value, label, onPress, style }: { value: string; label: string; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={[styles.tile, style]}>
      <Text variant="title3" style={styles.value}>
        {value}
      </Text>
      <Text variant="caption" weight="semibold" color="muted">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, borderRadius: radius.field, backgroundColor: colors.tile, padding: space.inset, gap: space.fine },
  value: { letterSpacing: -0.5 },
});
