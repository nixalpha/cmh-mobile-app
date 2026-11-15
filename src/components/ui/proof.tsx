import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, space } from '@/constants/theme';

export function ProofDot({ verified = true, style }: { verified?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.dot, verified ? styles.filled : styles.hollow, style]} />;
}

export function ProofLegend() {
  return (
    <View style={styles.legend}>
      <View style={styles.item}>
        <ProofDot />
        <Text variant="caption" weight="semibold" color="inkSoft">
          Photo or check-in
        </Text>
      </View>
      <View style={styles.item}>
        <ProofDot verified={false} />
        <Text variant="caption" weight="semibold" color="inkSoft">
          Self-reported
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
  filled: { backgroundColor: colors.accent },
  hollow: { borderWidth: 2, borderColor: colors.ink },
  legend: { flexDirection: 'row', gap: space.stack },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
});
