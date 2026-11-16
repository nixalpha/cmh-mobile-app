import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AsyncButton, Notice } from '@/components/live-ui';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Glass } from '@/components/ui/glass';
import { Screen } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { api, type Id } from '@/lib/backend';
import { space } from '@/constants/theme';

export default function OnboardingScreen() {
  const [selected, setSelected] = useState<{ id: Id<'destinations'>; name: string }[]>([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const addVisit = useMutation(api.places.addVisit);
  const popular = useQuery(api.destinations.popular, search ? 'skip' : { limit: 20 });
  const matches = useQuery(api.destinations.search, search ? { query: search, limit: 20 } : 'skip');
  const places = search ? matches : popular;

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const toggle = (id: Id<'destinations'>, name: string) => {
    if (savingRef.current) return;
    setSelected((current) => current.some((place) => place.id === id)
      ? current.filter((place) => place.id !== id)
      : current.length < 20 ? [...current, { id, name }] : current);
  };

  const continueToApp = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      for (const place of selected) await addVisit({ destinationId: place.id });
      router.replace('/feed');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Screen backdrop="onboarding" scroll>
      <Text variant="title" accessibilityRole="header">Where have you been?</Text>
      <SearchField placeholder="Search places" value={query} onChangeText={setQuery} />
      <Text variant="cardTitle">{search ? 'Search results' : 'Popular places'}</Text>
      {places === undefined || query.trim() !== search ? <Notice>Finding places…</Notice> : (
        <View style={styles.chips}>
          {places.map((place) => (
            <Chip
              key={place._id}
              label={`${place.name}, ${place.countryCode}`}
              check
              selected={selected.some((item) => item.id === place._id)}
              onPress={() => toggle(place._id, place.name)}
            />
          ))}
          {places.length === 0 && <Notice>No places found. Try another name.</Notice>}
        </View>
      )}
      <Glass style={styles.summary}>
        <Text variant="cardTitle">{selected.length} of 20 selected</Text>
        {selected.length > 0 && (
          <View style={styles.chips}>
            {selected.map((place) => (
              <Chip key={place.id} label={`${place.name} ×`} selected onPress={() => toggle(place.id, place.name)} />
            ))}
          </View>
        )}
        <AsyncButton label="Continue" onPress={continueToApp} />
        {!saving && <Button label="Skip" variant="link" onPress={() => router.replace('/feed')} />}
      </Glass>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.stack },
  summary: { padding: space.inset, gap: space.stack },
});
