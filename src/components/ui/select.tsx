import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors, radius } from '@/constants/theme';

export type SelectProps = {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
};

export function Select({ label, options, value, onChange }: SelectProps) {
  return (
    <View style={styles.root}>
      <Text variant="caption" weight="bold" color="inkSoft">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={() => onChange(options[(options.indexOf(value) + 1) % options.length])}
        style={styles.field}>
        <Text weight="bold">{value}</Text>
        <Icon name="chevronDown" size={16} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 6 },
  field: {
    height: 52,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: 'rgba(14,17,22,0.14)',
    backgroundColor: colors.tileStrong,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
