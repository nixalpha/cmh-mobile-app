import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Globe } from '@/components/globe';
import { Glass } from '@/components/ui/glass';
import { IconButton } from '@/components/ui/icon-button';
import { SearchField } from '@/components/ui/search-field';
import { SegmentedControl, type Segment } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { colors, space } from '@/constants/theme';
import { api, type Id } from '@/lib/backend';
import { MAX_GLOBE_LANDMARKS, SELF_PLACE_ID, selfPlace, type GlobeLandmark, type GlobePlace } from '@/lib/globe-bridge';
import { useDeviceLocation } from '@/lib/use-device-location';

type SearchMode = 'cities' | 'landmarks';
type Place = GlobePlace & { _id: Id<'destinations'> };
type Result = { key: string; title: string; subtitle: string; place: Place; landmark?: GlobeLandmark };

const PLACES: readonly Place[] = [];
const LANDMARKS: readonly GlobeLandmark[] = [];
const MODES: readonly Segment<SearchMode>[] = [
  { value: 'cities', label: 'Cities' },
  { value: 'landmarks', label: 'Landmarks' },
];
const RESULT_LIMIT = 6;
// Height of the logo / return-to-globe row the search bar sits under.
const HEADER_ROW = 44;
// The locate button sits left of the 32 pt zoom-out button.
const LOCATE_OFFSET = 44;

export function DiscoverMap({ active }: { active: boolean }) {
  const insets = useSafeAreaInsets();
  const popular = useQuery(api.destinations.popular, { limit: 20 });
  const [selectedId, setSelectedId] = useState<string>();
  const [focusRevision, setFocusRevision] = useState(0);
  const [zoomOutRevision, setZoomOutRevision] = useState(0);
  // A search result that isn't one of the popular pins, kept on the globe while it is selected.
  const [found, setFound] = useState<Place>();
  const [foundLandmark, setFoundLandmark] = useState<GlobeLandmark>();
  const [mode, setMode] = useState<SearchMode>('cities');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const device = useDeviceLocation(active);
  const me = useMemo(() => selfPlace(device.position), [device.position]);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timeout);
  }, [query]);

  const cityMatches = useQuery(api.destinations.search, search && mode === 'cities' ? { query: search, limit: RESULT_LIMIT } : 'skip');
  const landmarkMatches = useQuery(api.landmarks.search, search && mode === 'landmarks' ? { query: search, limit: RESULT_LIMIT } : 'skip');
  const results = useMemo<Result[] | undefined>(() => mode === 'cities'
    ? cityMatches?.map((place) => ({
        key: place._id, title: place.name, place,
        subtitle: [place.admin1, place.countryName].filter(Boolean).join(', '),
      }))
    : landmarkMatches?.map(({ landmark, destination }) => ({
        key: landmark._id, title: landmark.name, place: destination, landmark,
        subtitle: `${landmark.category} · ${destination.name}, ${destination.countryName}`,
      })), [mode, cityMatches, landmarkMatches]);

  const places = useMemo<readonly Place[]>(() => {
    const pins = popular ?? PLACES;
    return found && !pins.some((place) => place._id === found._id) ? [...pins, found] : pins;
  }, [popular, found]);
  const pins = useMemo<readonly GlobePlace[]>(() => me ? [...places, me] : places, [places, me]);
  const destinationId = places.find((place) => place._id === selectedId)?._id;
  const selected = useQuery(api.destinations.get, destinationId ? { destinationId } : 'skip');
  const landmarks = useMemo<readonly GlobeLandmark[]>(() => {
    const pins = selected?.landmarks ?? LANDMARKS;
    // A searched landmark is pinned straight away, even before (or beyond) its city's list.
    return foundLandmark && !pins.some((landmark) => landmark._id === foundLandmark._id)
      ? [foundLandmark, ...pins.slice(0, MAX_GLOBE_LANDMARKS - 1)] : pins;
  }, [selected, foundLandmark]);

  const selectPlace = useCallback((id: string) => {
    setSelectedId(id);
    setFoundLandmark(undefined);
    setFocusRevision((revision) => revision + 1);
  }, []);
  const showMe = useCallback(() => {
    setFound(undefined);
    setFoundLandmark(undefined);
    selectPlace(SELF_PLACE_ID);
  }, [selectPlace]);
  const locate = () => me ? showMe() : void device.locate(showMe).catch(() => {});
  const openLandmark = useCallback((landmark: string) => {
    if (destinationId) router.push({ pathname: '/city/[id]', params: { id: destinationId, landmark } });
  }, [destinationId]);
  const openResult = (result: Result) => {
    Keyboard.dismiss();
    setQuery('');
    setSearch('');
    setFound(result.place);
    setFoundLandmark(result.landmark);
    setSelectedId(result.place._id);
    setFocusRevision((revision) => revision + 1);
  };

  const top = insets.top + space.screenTop;
  const searching = query.trim() !== '';
  return (
    <View style={styles.map}>
      <Globe
        active={active}
        places={pins}
        selectedId={selectedId}
        landmarks={landmarks}
        selectedLandmarkId={foundLandmark?._id}
        focusRevision={focusRevision}
        zoomOutRevision={zoomOutRevision}
        onSelectPlace={selectPlace}
        onSelectLandmark={openLandmark}
      />
      <IconButton
        icon="minus"
        label="Return to globe view"
        variant="ink"
        onPress={() => {
          setSelectedId(undefined);
          setFound(undefined);
          setFoundLandmark(undefined);
          setZoomOutRevision((revision) => revision + 1);
        }}
        style={[styles.zoomOut, { top, right: insets.right + space.gutter }]}
      />
      <IconButton
        icon="compass"
        label="Show my location"
        variant="ink"
        selected={selectedId === SELF_PLACE_ID}
        onPress={locate}
        style={[styles.zoomOut, { top, right: insets.right + space.gutter + LOCATE_OFFSET }]}
      />
      <View pointerEvents="box-none" style={[styles.searchLayer, {
        top: top + HEADER_ROW + space.stack,
        paddingLeft: insets.left + space.gutter,
        paddingRight: insets.right + space.gutter,
      }]}>
        <View pointerEvents="box-none" style={styles.search}>
          <SearchField
            placeholder={mode === 'cities' ? 'Search cities' : 'Search landmarks'}
            value={query}
            onChangeText={setQuery}
            height={48}
            trailing={searching ? <IconButton icon="close" label="Clear search" variant="plain" onPress={() => setQuery('')} /> : undefined}
          />
          <SegmentedControl segments={MODES} value={mode} onChange={setMode} layout="compact" style={styles.modes} />
          {searching && (
            <Glass style={styles.results} accessibilityRole="list">
              {results === undefined || query.trim() !== search ? (
                <Text color="muted" style={styles.status}>Searching…</Text>
              ) : results.length === 0 ? (
                <Text color="muted" style={styles.status}>No {mode} match “{search}”.</Text>
              ) : results.map((result, index) => (
                <Pressable
                  key={result.key}
                  onPress={() => openResult(result)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${result.title} on the map. ${result.subtitle}`}
                  style={({ pressed }) => [styles.result, index > 0 && styles.divider, pressed && styles.pressed]}>
                  <Text variant="body" weight="semibold" numberOfLines={1}>{result.title}</Text>
                  <Text variant="caption" color="muted" numberOfLines={1}>{result.subtitle}</Text>
                </Pressable>
              ))}
            </Glass>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  zoomOut: { position: 'absolute' },
  searchLayer: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  search: { width: '100%', maxWidth: space.screenMaxWidth - space.gutter * 2, gap: space.stack },
  modes: { alignSelf: 'flex-start' },
  results: { paddingHorizontal: space.inset },
  status: { paddingVertical: space.inset },
  result: { minHeight: 44, justifyContent: 'center', paddingVertical: space.stack, gap: space.fine },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.inkLine },
  pressed: { opacity: 0.6 },
});
