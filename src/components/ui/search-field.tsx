import type { ReactNode } from 'react';
import { StyleSheet, TextInput, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from '@/components/ui/glass';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors, fonts } from '@/constants/theme';

export type SearchFieldProps = {
  placeholder: string;
  value?: string;
  onChangeText?: (text: string) => void;
  onPress?: () => void;
  height?: number;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SearchField({
  placeholder,
  value,
  onChangeText,
  onPress,
  height = 52,
  trailing,
  style,
}: SearchFieldProps) {
  return (
    <Glass
      radius={height / 2}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : 'search'}
      style={[styles.field, { height }, trailing !== undefined && styles.withTrailing, style]}>
      <Icon name="search" size={height < 50 ? 16 : 18} color={colors.slate} />
      {onPress ? (
        <Text color="muted" style={styles.input}>
          {placeholder}
        </Text>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          accessibilityLabel={placeholder}
          style={[styles.input, styles.text, !!value && styles.filled]}
        />
      )}
      {trailing}
    </Glass>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 },
  withTrailing: { paddingRight: 8 },
  input: { flex: 1 },
  text: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink, padding: 0 },
  filled: { fontFamily: fonts.semibold },
});
