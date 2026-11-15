import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ArtName } from '@/art';
import { Art } from '@/components/ui/art';
import { Glass } from '@/components/ui/glass';
import { ProofDot } from '@/components/ui/proof';
import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';

export function LandmarkLabel({ name, verified, style }: { name: string; verified: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Glass
      radius={radius.card}
      dashed={!verified}
      borderColor={verified ? undefined : 'rgba(14,17,22,0.45)'}
      style={[styles.label, style]}>
      <ProofDot verified={verified} />
      <Text variant="caption" weight="bold">
        {name}
      </Text>
    </Glass>
  );
}

export function LandmarkCard({ name, meta, art }: { name: string; meta: string; art: ArtName }) {
  return (
    <View style={styles.card}>
      <Art name={art} height={70} />
      <Text variant="meta" weight="extrabold">
        {name}
      </Text>
      <Text variant="micro" color="muted">
        {meta}
      </Text>
    </View>
  );
}

export function LandmarkChip({ name, art, color }: { name: string; art: ArtName; color: string }) {
  return (
    <Glass radius={radius.card} style={styles.chip}>
      <View style={[styles.chipIcon, { backgroundColor: color }]}>
        <Art name={art} width={18} height={18} />
      </View>
      <Text variant="meta" weight="bold">
        {name}
      </Text>
    </Glass>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute',
    height: 30,
    paddingLeft: space.stack,
    paddingRight: space.inset,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inline,
  },
  card: {
    width: 132,
    borderRadius: radius.card,
    padding: space.inset,
    gap: space.inline,
    backgroundColor: colors.tile,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  chip: { height: 40, paddingLeft: space.inline, paddingRight: space.inset, flexDirection: 'row', alignItems: 'center', gap: space.stack },
  chipIcon: { width: 28, height: 28, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
});
