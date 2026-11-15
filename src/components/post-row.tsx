import { StyleSheet, View } from 'react-native';

import { SceneThumb } from '@/components/scene-thumb';
import { Badge } from '@/components/ui/badge';
import { Glass } from '@/components/ui/glass';
import { Text } from '@/components/ui/text';
import type { Post } from '@/mocks/data';
import { radius, space } from '@/constants/theme';

export function PostRow({ post }: { post: Post }) {
  return (
    <Glass radius={radius.card} style={styles.row}>
      <SceneThumb {...post} />
      <View style={styles.copy}>
        <Text variant="label">
          {post.who}{' '}
          <Text variant="label" weight="medium" color="muted">
            {post.verb}
          </Text>{' '}
          {post.place}
        </Text>
        <Text variant="caption" color="muted">
          {post.meta}
        </Text>
      </View>
      <Badge label={post.badge} variant="tint" />
    </Glass>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.stack, padding: space.inset },
  copy: { flex: 1, gap: space.fine },
});
