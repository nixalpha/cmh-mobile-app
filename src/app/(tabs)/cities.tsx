import { usePaginatedQuery } from 'convex/react';
import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { Notice, PlaceArt } from '@/components/live-ui';
import { Button } from '@/components/ui/button';
import { Glass } from '@/components/ui/glass';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/backend';
import { space } from '@/constants/theme';

export default function CitiesScreen() {
  const { results, status, loadMore } = usePaginatedQuery(api.places.visits, {}, { initialNumItems: 20 });

  return (
    <Screen backdrop="cities" headerActions={<IconButton icon="plus" label="Add a past trip" onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'add' } })} />}>
      <FlatList
        data={results}
        keyExtractor={(item) => item.destination._id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="title" accessibilityRole="header">Your places</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Glass
            style={styles.card}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.destination.name}`}
            onPress={() => router.push({ pathname: '/city/[id]', params: { id: item.destination._id } })}>
            <PlaceArt place={item.destination} height={120} />
            <View style={styles.copy}>
              <Text variant="cardTitle">{item.destination.name}</Text>
              <Text variant="caption" color="muted">{item.destination.countryName}</Text>
              {item.rank !== null && <Text variant="caption" color="slate">#{item.rank}</Text>}
              {item.year !== null && <Text variant="caption" color="muted">{item.year}</Text>}
            </View>
          </Glass>
        )}
        ListEmptyComponent={<Notice>{status === 'LoadingFirstPage' ? 'Loading your places…' : 'No places yet.'}</Notice>}
        ListFooterComponent={
          <View style={styles.footer}>
            {status === 'CanLoadMore' && <Button label="Load more places" variant="secondary" onPress={() => loadMore(20)} />}
            {status === 'LoadingMore' && <Notice>Loading more places…</Notice>}
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: space.scrollBottom, gap: space.stack },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.stack, marginBottom: space.stack },
  row: { gap: space.stack },
  card: { flex: 1, maxWidth: '49%', overflow: 'hidden' },
  copy: { padding: space.inset, gap: space.inline },
  footer: { marginTop: space.stack },
});
