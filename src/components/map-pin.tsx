import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ArtName } from '@/art';
import { Art } from '@/components/ui/art';
import { CountDot } from '@/components/ui/badge';
import { Glass } from '@/components/ui/glass';
import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';

export type ScorePinProps = {
  label: string;
  score: string;
  mine?: boolean;
  cluster?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ScorePin({ label, score, mine, cluster, onPress, style }: ScorePinProps) {
  const content = (
    <>
      {cluster ? (
        <View style={styles.cluster}>
          <Text weight="extrabold" style={styles.clusterText}>
            {score}
          </Text>
        </View>
      ) : (
        <CountDot label={score} size={26} inverted={mine} />
      )}
      <Text variant="caption" weight="bold" color="ink">
        {label}
      </Text>
    </>
  );
  if (mine) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={[styles.score, styles.mine, style]}>
        {content}
      </Pressable>
    );
  }
  return (
    <Glass radius={radius.card} onPress={onPress ?? (() => {})} accessibilityRole="button" style={[styles.score, style]}>
      {content}
    </Glass>
  );
}

export function GlobePin({ name, art, onPress, style }: { name: string; art: ArtName; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name} style={[styles.globe, style]}>
      <Glass radius={radius.card} style={styles.globeLabel}>
        <Art name={art} width={20} height={20} />
        <Text variant="caption" weight="bold">
          {name}
        </Text>
      </Glass>
      <View style={styles.stem} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  score: {
    position: 'absolute',
    height: 34,
    paddingLeft: space.inline,
    paddingRight: space.inset,
    borderRadius: radius.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inline,
  },
  mine: { backgroundColor: colors.accent },
  cluster: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterText: { fontSize: 11, lineHeight: 16 },
  globe: { position: 'absolute', alignItems: 'center', gap: space.inline },
  globeLabel: { height: 28, paddingHorizontal: space.inset, flexDirection: 'row', alignItems: 'center', gap: space.inline },
  stem: { width: 2, height: 10, borderRadius: 1, backgroundColor: colors.accent },
});
