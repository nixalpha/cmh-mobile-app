import { StyleSheet, View } from 'react-native';

import type { ArtName } from '@/art';
import { Art } from '@/components/ui/art';
import { Glass } from '@/components/ui/glass';
import { ProofDot } from '@/components/ui/proof';
import { Text } from '@/components/ui/text';
import { radius, space } from '@/constants/theme';

export type CityTileProps = {
  name: string;
  meta: string;
  verified: number;
  selfReported: number;
  art: ArtName;
  onPress?: () => void;
};

export function CityTile({ name, meta, verified, selfReported, art, onPress }: CityTileProps) {
  return (
    <Glass radius={radius.card} onPress={onPress ?? (() => {})} accessibilityRole="button" style={styles.card}>
      <Art name={art} height={96} />
      <Text variant="cardTitle">{name}</Text>
      <Text variant="caption" color="muted">
        {meta}
      </Text>
      <View style={styles.counts}>
        <ProofDot />
        <Text variant="caption" weight="bold">
          {selfReported ? verified : `${verified} landmarks`}
        </Text>
        {selfReported > 0 && (
          <>
            <ProofDot verified={false} style={styles.second} />
            <Text variant="caption" weight="bold">
              {selfReported} landmarks
            </Text>
          </>
        )}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, paddingTop: space.inset, paddingHorizontal: space.inset, paddingBottom: space.inset, gap: space.inline },
  counts: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  second: { marginLeft: space.inline },
});
