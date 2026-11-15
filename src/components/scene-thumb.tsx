import { StyleSheet, View } from 'react-native';

import type { Scene } from '@/mocks/data';

export function SceneThumb({ sky, ground, mark, size = 64 }: Scene & { size?: number }) {
  const unit = size / 64;
  return (
    <View style={[styles.thumb, { width: size, height: size, borderRadius: size / 4, backgroundColor: sky }]}>
      <View style={[styles.ground, { height: 28 * unit, backgroundColor: ground }]} />
      <View
        style={[
          styles.mark,
          { left: 26 * unit, bottom: 18 * unit, width: 12 * unit, height: 30 * unit, backgroundColor: mark },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { overflow: 'hidden' },
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  mark: { position: 'absolute', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
});
