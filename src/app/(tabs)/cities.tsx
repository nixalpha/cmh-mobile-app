import { usePaginatedQuery } from 'convex/react';
import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { Notice, PlaceArt } from '@/components/live-ui';
import { Button } from '@/components/ui/button';
import { Glass } from '@/components/ui/glass';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/backend';

export default function CitiesScreen() {
  const { results, status, loadMore } = usePaginatedQuery(api.places.visits, {}, { initialNumItems: 20 });

  return (
    <Screen backdrop="cities">
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
            <Button label="Add a past trip" icon="plus" onPress={() => router.push('/onboarding')} />
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
  list: { paddingBottom: 140, gap: 12 },
  header: { gap: 12, marginBottom: 8 },
  row: { gap: 12 },
  card: { flex: 1, maxWidth: '49%', overflow: 'hidden' },
  copy: { padding: 14, gap: 4 },
  footer: { marginTop: 8 },
});
