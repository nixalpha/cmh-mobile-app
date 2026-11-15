import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from '@/components/ui/glass';
import { Icon, type IconName } from '@/components/ui/icon';
import { IndicatorItem, IndicatorPill, useSlidingIndicator } from '@/components/ui/sliding-indicator';
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
  const indicator = useSlidingIndicator(segments.findIndex((segment) => segment.value === value));

  const content = (segment: Segment<T>, tint: string) => (
    <>
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
    </>
  );

  return (
    <Glass radius={layout === 'fill' ? 24 : layout === 'icons' ? 25 : 22} style={[styles.track, layout !== 'fill' && styles.tight, style]}>
      <IndicatorPill indicator={indicator} style={[styles.pill, { borderRadius: styles[layout].borderRadius }]} />
      {segments.map((segment, index) => (
        <Pressable
          key={segment.value}
          onPress={() => onChange(segment.value)}
          onLayout={indicator.onItemLayout(index)}
          accessibilityRole="tab"
          accessibilityLabel={segment.label}
          accessibilityState={{ selected: segment.value === value }}
          style={[styles.segment, styles[layout]]}>
          <IndicatorItem
            indicator={indicator}
            index={index}
            inactive={content(segment, colors.slate)}
            active={content(segment, colors.white)}
          />
        </Pressable>
      ))}
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
  pill: { backgroundColor: colors.ink },
  compactLabel: { fontSize: 13, lineHeight: 18 },
});
