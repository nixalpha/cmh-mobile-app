import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors } from '@/constants/theme';

export type AvatarProps = {
  initials: string;
  color: string;
  size?: number;
  ring?: number;
  style?: StyleProp<ViewStyle>;
};

export function Avatar({ initials, color, size = 40, ring = 2, style }: AvatarProps) {
  const fontSize = size >= 72 ? 24 : size >= 52 ? 15 : size >= 40 ? 14 : 12;
  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: ring },
        style,
      ]}>
      <Text weight="bold" style={{ fontSize, lineHeight: fontSize * 1.3 }}>
        {initials}
      </Text>
    </View>
  );
}

export function AvatarStack({ people, size = 36 }: { people: readonly { initials: string; color: string }[]; size?: number }) {
  return (
    <View style={styles.stack}>
      {people.map((person) => (
        <Avatar key={person.initials} {...person} size={size} style={styles.overlap} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderColor: colors.white },
  stack: { flexDirection: 'row', paddingLeft: 8 },
  overlap: { marginLeft: -8 },
});
