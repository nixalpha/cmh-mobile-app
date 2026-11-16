import { useConvex, useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AddingPlaces } from '@/components/adding-places';
import { AsyncButton, errorMessage, Notice } from '@/components/live-ui';
import { PhotoScan, type PhotoScanStep } from '@/components/photo-scan';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Loading } from '@/components/ui/loading';
import { Screen } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { api, type Id } from '@/lib/backend';
import { placeLabel } from '@/lib/photo-places';
import { photoScanSupported, scanPhotos, type ScanProgress } from '@/lib/scan-photos';
import { space } from '@/constants/theme';

const MAX_PLACES = 30;
const BUTTON_HEIGHT = 44;
// Thumbnails kept for the scan animation. Older ones drop off once this is reached.
const PREVIEW_POOL = 240;
// How long the finished "Your places are in" screen stays up before leaving.
const ADDED_HOLD_MS = 700;

type Place = { id: Id<'destinations'>; name: string; countryCode: string; takenAt?: number };
export default function OnboardingScreen() {
  const client = useConvex();
  // The Places tab opens this screen to add a trip. Only first-run onboarding reads the camera roll.
  const adding = useLocalSearchParams<{ mode?: string }>().mode === 'add';
  const scan = photoScanSupported && !adding;
  const [scanning, setScanning] = useState(scan);
  const [found, setFound] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place[]>([]);
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<string[]>([]);
  const [checked, setChecked] = useState(0);
  const [step, setStep] = useState<PhotoScanStep>('photos');

  // Reads where the camera roll's photos were taken as soon as onboarding opens.
  useEffect(() => {
    if (!scan) return;
    let cancelled = false;
    const onProgress = (progress: ScanProgress) => {
      if (cancelled) return;
      setChecked(progress.checked);
      setPreview((current) => [...current, ...progress.uris].slice(-PREVIEW_POOL));
    };
    const onMatching = () => { if (!cancelled) setStep('places'); };
    void findPhotoPlaces(client, onProgress, onMatching).then((places) => {
      if (cancelled) return;
      if (places === null) setNotice('Allow photo access to fill this in from your photos.');
      else { setFound(places); setSelected(places); }
    }).catch((cause) => { if (!cancelled) setNotice(errorMessage(cause)); })
      .finally(() => { if (!cancelled) setScanning(false); });
    return () => { cancelled = true; };
  }, [client, scan]);

  if (scanning) {
    return (
      <Screen backdrop="onboarding" style={styles.fill}>
        <View style={styles.center}>
          <Text variant="title" style={styles.centerText} accessibilityRole="header">Where have you been?</Text>
          <PhotoScan uris={preview} checked={checked} step={step} />
        </View>
      </Screen>
    );
  }
  return <PickPlaces found={found} selected={selected} setSelected={setSelected} notice={notice} adding={adding} />;
}

// Looks up each photo spot's city. Places already on the account are left out.
async function findPhotoPlaces(
  client: ReturnType<typeof useConvex>,
  onProgress: (progress: ScanProgress) => void,
  onMatching: () => void,
): Promise<Place[] | null> {
  const result = await scanPhotos(onProgress, onMatching);
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

function PickPlaces({ found, selected, setSelected, notice, adding }: {
  found: Place[];
  selected: Place[];
  setSelected: (update: (current: Place[]) => Place[]) => void;
  notice: string;
  adding: boolean;
}) {
  const done = () => (adding ? router.back() : router.replace('/permissions'));
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  // Places being saved and how many are done. Null while picking.
  const [progress, setProgress] = useState<{ places: Place[]; saved: number } | null>(null);
  const [saveError, setSaveError] = useState('');
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
    if (selected.length === 0) { done(); return; }
    savingRef.current = true;
    const places = selected;
    setSaveError('');
    setProgress({ places, saved: 0 });
    try {
      for (const [index, place] of places.entries()) {
        const when = place.takenAt ? new Date(place.takenAt) : null;
        await addVisit(when
          ? { destinationId: place.id, year: when.getFullYear(), month: when.getMonth() + 1 }
          : { destinationId: place.id });
        setProgress({ places, saved: index + 1 });
      }
      await new Promise((resolve) => setTimeout(resolve, ADDED_HOLD_MS));
      done();
    } catch (cause) {
      // Back to the picker so the places can be retried. Visits already saved stay saved.
      setProgress(null);
      setSaveError(errorMessage(cause));
    } finally {
      savingRef.current = false;
    }
  };

  if (progress) {
    return (
      <Screen backdrop="onboarding" style={styles.fill}>
        <View style={styles.center}>
          <AddingPlaces places={progress.places} saved={progress.saved} />
        </View>
      </Screen>
    );
  }

  const loading = results === undefined || query.trim() !== search;
  return (
    <Screen backdrop="onboarding" scroll style={styles.fill}>
      <View style={styles.center}>
        <Text variant="title" style={styles.centerText} accessibilityRole="header">{adding ? 'Add a place' : 'Where have you been?'}</Text>
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
        {loading && <Loading label={search ? 'Searching…' : 'Loading places…'} />}
        {!loading && !!search && results?.length === 0 && <Notice>No matches.</Notice>}
        <AsyncButton
          label={selected.length > 0 ? `Add ${selected.length} ${selected.length === 1 ? 'place' : 'places'}` : adding ? 'Done' : 'Continue'}
          height={BUTTON_HEIGHT}
          onPress={save}
        />
        {!!saveError && <Notice>{saveError}</Notice>}
        <Button label={adding ? 'Cancel' : 'Skip'} variant="link" height={BUTTON_HEIGHT} onPress={done} />
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
