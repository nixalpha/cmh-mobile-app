import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from '@/components/ui/glass';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors } from '@/constants/theme';

export type ChipProps = {
  label: string;
  selected?: boolean;
  size?: 'small' | 'large';
  check?: boolean;
  leading?: ReactNode;
  surface?: 'glass' | 'tile';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const sizes = {
  small: { height: 36, paddingHorizontal: 14, fontSize: 13, weight: 'bold' },
  large: { height: 44, paddingHorizontal: 16, fontSize: 14, weight: 'semibold' },
} as const;

export function Chip({
  label,
  selected,
  size = 'small',
  check,
  leading,
  surface = 'glass',
  onPress,
  style,
}: ChipProps) {
  const metrics = sizes[size];
  const shape = [
    styles.base,
    {
      height: metrics.height,
      borderRadius: metrics.height / 2,
      paddingHorizontal: metrics.paddingHorizontal,
    },
    leading !== undefined && styles.withLeading,
  ];
  const content = (
    <>
      {leading}
      {check && selected && <Icon name="check" size={16} color={colors.white} strokeWidth={2.5} />}
      <Text
        weight={metrics.weight}
        style={{ fontSize: metrics.fontSize, lineHeight: metrics.fontSize * 1.4 }}
        color={selected ? 'white' : 'ink'}>
        {label}
      </Text>
    </>
  );
  if (selected || surface === 'tile') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: !!selected }}
        style={[shape, selected ? styles.selected : styles.tile, style]}>
        {content}
      </Pressable>
    );
  }
  return (
    <Glass
      flat
      radius={metrics.height / 2}
      onPress={onPress ?? (() => {})}
      accessibilityRole="button"
      accessibilityState={{ selected: false }}
      style={[shape, style]}>
      {content}
    </Glass>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  withLeading: { paddingLeft: 6, paddingRight: 12 },
  selected: { backgroundColor: colors.ink },
  tile: { backgroundColor: colors.tileStrong },
});
