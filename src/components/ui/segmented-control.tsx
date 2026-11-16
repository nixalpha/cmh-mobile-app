import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from '@/components/ui/glass';
import { Icon, type IconName } from '@/components/ui/icon';
import { IndicatorItem, IndicatorPill, useSlidingIndicator } from '@/components/ui/sliding-indicator';
import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';

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
    <Glass radius={radius.field} style={[styles.track, layout !== 'fill' && styles.tight, style]}>
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
            active={content(segment, colors.accentForeground)}
          />
        </Pressable>
      ))}
    </Glass>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: space.inline, gap: space.inline },
  tight: { gap: space.fine },
  segment: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.inline },
  fill: { flex: 1, height: 40, borderRadius: radius.inner },
  compact: { height: 36, paddingHorizontal: space.inset, borderRadius: radius.inner },
  icons: { width: 42, height: 42, borderRadius: radius.inner },
  pill: { backgroundColor: colors.accent },
  compactLabel: { fontSize: 13, lineHeight: 18 },
});
