import { Pressable, StyleSheet, View } from 'react-native';

import { SceneThumb } from '@/components/scene-thumb';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import type { Scene } from '@/mocks/data';
import { space } from '@/constants/theme';

export type PlaceRowProps = Scene & { name: string; meta: string; score: string; onPress?: () => void };

export function PlaceRow({ name, meta, score, onPress, ...scene }: PlaceRowProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.row}>
      <SceneThumb {...scene} size={48} />
      <View style={styles.copy}>
        <Text weight="extrabold">{name}</Text>
        <Text variant="caption" color="muted">
          {meta}
        </Text>
      </View>
      <Badge label={score} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.stack },
  copy: { flex: 1, gap: space.fine },
});
