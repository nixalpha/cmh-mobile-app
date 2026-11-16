import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from '@/components/ui/glass';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors, radius as radii, space } from '@/constants/theme';

export type ActionCardProps = {
  icon: IconName;
  title: string;
  subtitle: string;
  dashed?: boolean;
  round?: boolean;
  radius?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ActionCard({ icon, title, subtitle, dashed, round, radius = radii.card, onPress, style }: ActionCardProps) {
  return (
    <Glass
      radius={radius}
      dashed={dashed}
      flat={dashed}
      variant={dashed ? 'dim' : 'regular'}
      borderColor={dashed ? 'rgba(14,17,22,0.32)' : undefined}
      onPress={onPress ?? (() => {})}
      accessibilityRole="button"
      style={[styles.card, style]}>
      <View style={[styles.icon, round && styles.round]}>
        <Icon name={icon} size={20} color={colors.accentForeground} />
      </View>
      <View style={styles.copy}>
        <Text weight={dashed ? 'extrabold' : 'bold'}>{title}</Text>
        <Text variant={dashed ? 'caption' : 'meta'} color="muted">
          {subtitle}
        </Text>
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.stack, padding: space.inset },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.card,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  round: { borderRadius: radii.card },
  copy: { flex: 1, gap: space.fine },
});
