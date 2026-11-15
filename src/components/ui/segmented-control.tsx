import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from '@/components/ui/glass';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors } from '@/constants/theme';

export type Segment<T extends string> = { value: T; label: string; icon?: IconName };

export type SegmentedControlProps<T extends string> = {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  layout?: 'fill' | 'compact' | 'icons';
  style?: StyleProp<ViewStyle>;
};

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  layout = 'fill',
  style,
}: SegmentedControlProps<T>) {
  return (
    <Glass radius={layout === 'fill' ? 24 : layout === 'icons' ? 25 : 22} style={[styles.track, layout !== 'fill' && styles.tight, style]}>
      {segments.map((segment) => {
        const selected = segment.value === value;
        const tint = selected ? colors.white : colors.slate;
        return (
          <Pressable
            key={segment.value}
            onPress={() => onChange(segment.value)}
            accessibilityRole="tab"
            accessibilityLabel={segment.label}
            accessibilityState={{ selected }}
            style={[styles.segment, styles[layout], selected && styles.selected]}>
            {segment.icon && (
              <Icon
                name={segment.icon}
                size={layout === 'icons' ? 18 : 14}
                strokeWidth={layout === 'icons' ? 2 : 2.2}
                color={tint}
              />
            )}
            {layout !== 'icons' && (
              <Text variant="label" style={[{ color: tint }, layout === 'compact' && styles.compactLabel]}>
                {segment.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </Glass>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 4, gap: 4 },
  tight: { gap: 2 },
  segment: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  fill: { flex: 1, height: 40, borderRadius: 20 },
  compact: { height: 36, paddingHorizontal: 14, borderRadius: 18 },
  icons: { width: 42, height: 42, borderRadius: 21 },
  selected: { backgroundColor: colors.ink },
  compactLabel: { fontSize: 13, lineHeight: 18 },
});
