import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, radius } from '@/constants/theme';

export function StatTile({ value, label, onPress }: { value: string; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.tile}>
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
  tile: { flex: 1, borderRadius: radius.field, backgroundColor: colors.tile, padding: 12, gap: 2 },
  value: { letterSpacing: -0.5 },
});
