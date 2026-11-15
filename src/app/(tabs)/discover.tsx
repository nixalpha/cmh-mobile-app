import { useQuery } from 'convex/react';
import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice, PlaceArt } from '@/components/live-ui';
import { Glass } from '@/components/ui/glass';
import { Screen } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { api } from '@/lib/backend';

export default function DiscoverScreen() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const popular = useQuery(api.destinations.popular, search ? 'skip' : { limit: 20 });
  const matches = useQuery(api.destinations.search, search ? { query: search, limit: 20 } : 'skip');
  const places = search ? matches : popular;

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Screen backdrop="discover" scroll>
      <Text variant="title" accessibilityRole="header">Discover</Text>
      <Text color="slate">Find your next city or island.</Text>
      <SearchField placeholder="Search places" value={query} onChangeText={setQuery} />
      <Text variant="cardTitle">{search ? 'Search results' : 'Popular places'}</Text>
      {places === undefined || query.trim() !== search ? <Notice>Finding places…</Notice> : (
        <View style={styles.grid}>
          {places.map((place) => (
            <Glass
              key={place._id}
              style={styles.card}
              accessibilityRole="button"
              accessibilityLabel={`Explore ${place.name}, ${place.countryName}`}
              onPress={() => router.push({ pathname: '/place/[id]', params: { id: place._id } })}>
              <PlaceArt place={place} height={120} />
              <View style={styles.copy}>
                <Text variant="cardTitle">{place.name}</Text>
                <Text variant="caption" color="muted">{place.countryName} · {place.kind}</Text>
                <Text variant="caption" color="slate">{place.landmarkCount} landmarks</Text>
              </View>
            </Glass>
          ))}
          {places.length === 0 && <Notice>No places found. Try another name.</Notice>}
        </View>
      )}
      {!!search && places?.length === 20 && <Notice>Showing the first 20 matches. Refine your search for more specific results.</Notice>}
      <Text variant="caption" color="muted">
        Place data adapted from <Link href="https://www.geonames.org/">GeoNames</Link> (<Link href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Link>), <Link href="https://www.wikidata.org/">Wikidata</Link> (CC0), and <Link href="https://en.wikivoyage.org/">Wikivoyage contributors</Link> (<Link href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</Link>). Catalog selection and labels have been adapted.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '48%', flexGrow: 1, overflow: 'hidden' },
  copy: { padding: 14, gap: 4 },
});
