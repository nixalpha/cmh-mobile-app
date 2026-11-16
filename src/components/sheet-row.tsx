import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors } from '@/constants/theme';

export type SheetRowProps = {
  icon: IconName;
  title: string;
  subtitle?: string;
  /** Replaces the chevron, e.g. with a switch. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Content shown under the row, such as quick-pick chips. */
  children?: ReactNode;
  last?: boolean;
};

/** One line of a settings-style sheet: icon, title, chevron, and optional content below. */
export function SheetRow({ icon, title, subtitle, trailing, onPress, children, last }: SheetRowProps) {
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}>
        <Icon name={icon} size={24} strokeWidth={1.75} />
        <View style={styles.copy}>
          <Text variant="body" weight="medium">{title}</Text>
          {subtitle && <Text variant="caption" color="muted">{subtitle}</Text>}
        </View>
        {trailing ?? (onPress && <Icon name="chevronRight" size={18} color={colors.inkFaint} />)}
      </Pressable>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 14, gap: 12 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.inkLine },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 32 },
  pressed: { opacity: 0.6 },
  copy: { flex: 1, gap: 2 },
});
