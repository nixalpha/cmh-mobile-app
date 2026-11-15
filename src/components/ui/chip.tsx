import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from '@/components/ui/glass';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';

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
  small: { height: 36, paddingHorizontal: space.inset, fontSize: 13, weight: 'bold' },
  large: { height: 44, paddingHorizontal: space.inset, fontSize: 14, weight: 'semibold' },
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
      borderRadius: radius.control,
      paddingHorizontal: metrics.paddingHorizontal,
    },
    leading !== undefined && styles.withLeading,
  ];
  const content = (
    <>
      {leading}
      {check && selected && <Icon name="check" size={16} color={colors.accentForeground} strokeWidth={2.5} />}
      <Text
        weight={metrics.weight}
        style={{ fontSize: metrics.fontSize, lineHeight: metrics.fontSize * 1.4 }}
        color="ink">
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
      radius={radius.card}
      onPress={onPress ?? (() => {})}
      accessibilityRole="button"
      accessibilityState={{ selected: false }}
      style={[shape, style]}>
      {content}
    </Glass>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: space.stack },
  withLeading: { paddingLeft: space.inline, paddingRight: space.inset },
  selected: { backgroundColor: colors.accent },
  tile: { backgroundColor: colors.tileStrong },
});
