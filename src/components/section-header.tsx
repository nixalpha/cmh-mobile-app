import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { TextVariant } from '@/constants/theme';

export type SectionHeaderProps = {
  title: string;
  count?: number;
  trailing?: string;
  variant?: Extract<TextVariant, 'heading' | 'subheading'>;
  onTrailingPress?: () => void;
};

export function SectionHeader({ title, count, trailing, variant = 'subheading', onTrailingPress }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text variant={variant} accessibilityRole="header">
        {title}
        {count !== undefined && (
          <Text variant={variant} weight="semibold" color="muted">
            {' '}
            {count}
          </Text>
        )}
      </Text>
      {trailing &&
        (onTrailingPress ? (
          <Pressable onPress={onTrailingPress} accessibilityRole="button" hitSlop={12}>
            <Text variant="meta" weight="bold">
              {trailing}
            </Text>
          </Pressable>
        ) : (
          <Text variant="caption" weight="semibold" color="muted">
            {trailing}
          </Text>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
});
