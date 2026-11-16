import { useConvex, useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AsyncButton, errorMessage, Notice } from '@/components/live-ui';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { api, type Id } from '@/lib/backend';
import { placeLabel } from '@/lib/photo-places';
import { photoScanSupported, scanPhotos } from '@/lib/scan-photos';
import { space } from '@/constants/theme';

const MAX_PLACES = 30;
const BUTTON_HEIGHT = 44;

type Place = { id: Id<'destinations'>; name: string; countryCode: string; takenAt?: number };
export default function OnboardingScreen() {
  const client = useConvex();
  const [scanning, setScanning] = useState(photoScanSupported);
  const [found, setFound] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place[]>([]);
  const [notice, setNotice] = useState('');

  // Reads where the camera roll's photos were taken as soon as onboarding opens.
  useEffect(() => {
    if (!photoScanSupported) return;
    let cancelled = false;
    void findPhotoPlaces(client).then((places) => {
      if (cancelled) return;
      if (places === null) setNotice('Allow photo access to fill this in from your photos.');
      else { setFound(places); setSelected(places); }
    }).catch((cause) => { if (!cancelled) setNotice(errorMessage(cause)); })
      .finally(() => { if (!cancelled) setScanning(false); });
    return () => { cancelled = true; };
  }, [client]);

  if (scanning) {
    return (
      <Screen backdrop="onboarding" style={styles.fill}>
        <View style={styles.center}>
          <Text variant="title" style={styles.centerText} accessibilityRole="header">Where have you been?</Text>
          <Text color="muted" style={styles.centerText}>Checking your photos…</Text>
        </View>
      </Screen>
    );
  }
  return <PickPlaces found={found} selected={selected} setSelected={setSelected} notice={notice} />;
}

// Looks up each photo spot's city. Places already on the account are left out.
async function findPhotoPlaces(client: ReturnType<typeof useConvex>): Promise<Place[] | null> {
  const result = await scanPhotos();
  if (result.status === 'denied') return null;
  const places: Place[] = [];
  const labels = new Set<string>();
  for (const spot of result.spots) {
    const match = await client.query(api.places.cityAt, {
      lat: spot.lat, lng: spot.lng, city: spot.city, countryCode: spot.countryCode,
    }).catch(() => null);
    if (!match || match.visited) continue;
    const label = placeLabel(match.destination);
    if (labels.has(label)) continue;
    labels.add(label);
    places.push({ id: match.destination._id, name: match.destination.name, countryCode: match.destination.countryCode, takenAt: spot.takenAt });
    if (places.length >= MAX_PLACES) break;
  }
  return places;
}

function PickPlaces({ found, selected, setSelected, notice }: {
  found: Place[];
  selected: Place[];
  setSelected: (update: (current: Place[]) => Place[]) => void;
  notice: string;
}) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const addVisit = useMutation(api.places.addVisit);
  const popular = useQuery(api.destinations.popular, search ? 'skip' : { limit: 20 });
  const matches = useQuery(api.destinations.search, search ? { query: search, limit: 20 } : 'skip');
  const results = search ? matches : popular;

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Found places stay listed even when deselected, so they can be turned back on.
  const foundLabels = new Set(found.map(placeLabel));
  const extra: Place[] = [];
  const labels = new Set(foundLabels);
  for (const place of [...selected, ...(results ?? []).map((item) => ({ id: item._id, name: item.name, countryCode: item.countryCode }))]) {
    const label = placeLabel(place);
    if (labels.has(label)) continue;
    labels.add(label);
    extra.push(place);
  }
  const isSelected = (place: Place) => selected.some((item) => placeLabel(item) === placeLabel(place));

  const toggle = (place: Place) => {
    if (savingRef.current) return;
    setSelected((current) => current.some((item) => placeLabel(item) === placeLabel(place))
      ? current.filter((item) => placeLabel(item) !== placeLabel(place))
      : current.length < MAX_PLACES ? [...current, place] : current);
  };

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      for (const place of selected) {
        const when = place.takenAt ? new Date(place.takenAt) : null;
        await addVisit(when
          ? { destinationId: place.id, year: when.getFullYear(), month: when.getMonth() + 1 }
          : { destinationId: place.id });
      }
      router.replace('/permissions');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const loading = results === undefined || query.trim() !== search;
  return (
    <Screen backdrop="onboarding" scroll style={styles.fill}>
      <View style={styles.center}>
        <Text variant="title" style={styles.centerText} accessibilityRole="header">Where have you been?</Text>
        {!!notice && <Text color="muted" style={styles.centerText}>{notice}</Text>}
        {found.length > 0 && (
          <>
            <Text variant="label" color="muted" style={styles.centerText}>From your photos</Text>
            <View style={styles.chips}>
              {found.map((place) => (
                <Chip key={place.id} label={`${place.name}, ${place.countryCode}`} check selected={isSelected(place)} onPress={() => toggle(place)} />
              ))}
            </View>
          </>
        )}
        <SearchField placeholder="Add a place" value={query} onChangeText={setQuery} height={BUTTON_HEIGHT} />
        <View style={styles.chips}>
          {extra.map((place) => (
            <Chip key={place.id} label={`${place.name}, ${place.countryCode}`} check selected={isSelected(place)} onPress={() => toggle(place)} />
          ))}
        </View>
        {loading && <Notice>Loading…</Notice>}
        {!loading && !!search && results?.length === 0 && <Notice>No matches.</Notice>}
        <AsyncButton
          label={selected.length > 0 ? `Add ${selected.length} ${selected.length === 1 ? 'place' : 'places'}` : 'Continue'}
          height={BUTTON_HEIGHT}
          onPress={save}
        />
        {!saving && <Button label="Skip" variant="link" height={BUTTON_HEIGHT} onPress={() => router.replace('/permissions')} />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center', gap: space.inset, paddingBottom: space.gutter },
  centerText: { textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.stack },
});
