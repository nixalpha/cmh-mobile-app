import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';

export type PageDotsProps = {
  count: number;
  active: number;
  shape?: 'dots' | 'bars';
  gap?: number;
};

export function PageDots({ count, active, shape = 'dots', gap = 6 }: PageDotsProps) {
  return (
    <View
      style={[styles.row, { gap }]}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${active + 1} of ${count}`}>
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={[
            styles.dot,
            (shape === 'bars' || index === active) && styles.wide,
            index === active && styles.active,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.inkFaint },
  wide: { width: 22 },
  active: { backgroundColor: colors.accent },
});
