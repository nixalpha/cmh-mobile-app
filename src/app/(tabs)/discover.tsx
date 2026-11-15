import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Globe } from '@/components/globe';
import { GlobePin, ScorePin } from '@/components/map-pin';
import { PlaceRow } from '@/components/place-row';
import { SectionHeader } from '@/components/section-header';
import { Art } from '@/components/ui/art';
import { Chip } from '@/components/ui/chip';
import { Glass } from '@/components/ui/glass';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen, useScreenTop } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { colors, radius, space } from '@/constants/theme';
import { globePins, inView, mapFilters, mapPins, mapRegion } from '@/mocks/data';

const views = [
  { value: 'globe', label: 'Globe', icon: 'globe' },
  { value: 'map', label: 'Map', icon: 'map' },
] as const;

type ViewMode = (typeof views)[number]['value'];

const openKyoto = () => router.push('/place/kyoto');

export default function DiscoverScreen() {
  const [mode, setMode] = useState<ViewMode>('globe');
  return mode === 'globe' ? <GlobeView onMode={setMode} /> : <MapView onMode={setMode} />;
}

function GlobeView({ onMode }: { onMode: (mode: ViewMode) => void }) {
  const [paused, setPaused] = useState(false);
  const { width } = useWindowDimensions();
  const top = useScreenTop();

  return (
    <Screen
      backdrop="discover"
      color="#E6ECF3"
      style={styles.globeHeader}
      overlay={
        <>
          <View style={[styles.stage, { top: top + 154, left: (width - 390) / 2 }]}>
            <Glass radius={186} style={styles.halo} />
            <View style={styles.globe}>
              <Globe paused={paused} />
            </View>
            {globePins.map(({ left, top: pinTop, ...pin }) => (
              <GlobePin key={pin.name} {...pin} onPress={openKyoto} style={{ left, top: pinTop }} />
            ))}
            <IconButton
              icon={paused ? 'play' : 'pause'}
              label={paused ? 'Resume globe rotation' : 'Pause globe rotation'}
              size={52}
              onPress={() => setPaused(!paused)}
              style={styles.pause}
            />
            <Text variant="caption" weight="semibold" color="inkSoft" style={styles.hint}>
              {paused
                ? 'Paused · every landmark stays put · tap one'
                : 'Spinning · touch the globe or pause to hold it still'}
            </Text>
          </View>

          <Glass radius={26} onPress={openKyoto} accessibilityRole="button" style={styles.inView}>
            <View style={styles.inViewThumb}>
              <Art name="thumbKyoto" width={56} height={56} />
            </View>
            <View style={styles.inViewCopy}>
              <Text variant="eyebrow" color="muted">
                IN VIEW NOW
              </Text>
              <Text variant="cardTitle">{inView.name}</Text>
              <Text variant="caption" color="muted">
                {inView.meta}
              </Text>
            </View>
            <Icon name="chevronRight" />
          </Glass>
        </>
      }>
      <View style={styles.titleRow}>
        <Text variant="title" accessibilityRole="header">
          Discover
        </Text>
        <SegmentedControl layout="compact" segments={views} value="globe" onChange={onMode} />
      </View>
      <SearchField
        placeholder="Search a city or landmark"
        onPress={openKyoto}
        trailing={
          <View style={styles.filter}>
            <Icon name="sliders" size={16} color={colors.white} />
          </View>
        }
      />
    </Screen>
  );
}

function MapView({ onMode }: { onMode: (mode: ViewMode) => void }) {
  const [filter, setFilter] = useState(mapFilters[0]);
  const { width } = useWindowDimensions();
  const scale = width / 390;

  return (
    <Screen
      color="#CFE2F0"
      style={styles.mapHeader}
      background={
        <View style={[styles.map, { width, height: 844 * scale }]}>
          <Art name="mapIberia" />
        </View>
      }
      overlay={
        <>
          {mapPins.map(({ left, top, ...pin }) => (
            <ScorePin key={pin.label} {...pin} onPress={openKyoto} style={{ left: left * scale, top: top * scale }} />
          ))}

          <Glass radius={22} style={[styles.zoom, { top: 380 * scale }]}>
            <IconButton variant="plain" icon="plus" label="Zoom in" />
            <View style={styles.zoomRule} />
            <IconButton variant="plain" icon="minus" label="Zoom out" />
          </Glass>

          <Glass radius={radius.panel} style={styles.sheet}>
            <View style={styles.grabber} />
            <SectionHeader title={mapRegion.title} trailing={mapRegion.count} />
            {mapRegion.places.map((place) => (
              <PlaceRow key={place.name} {...place} onPress={openKyoto} />
            ))}
          </Glass>
        </>
      }>
      <View style={styles.mapSearchRow}>
        <SearchField placeholder="Search this area" height={50} onPress={openKyoto} style={styles.mapSearch} />
        <SegmentedControl layout="icons" segments={views} value="map" onChange={onMode} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filters}>
        {mapFilters.map((option) => (
          <Chip key={option} label={option} selected={option === filter} onPress={() => setFilter(option)} />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  globeHeader: { gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filter: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: { position: 'absolute', width: 390, height: 390 },
  halo: { position: 'absolute', left: 9, top: -16, width: 372, height: 372 },
  globe: { position: 'absolute', left: 25, top: 0 },
  pause: { position: 'absolute', left: 316, top: 296 },
  hint: { position: 'absolute', left: 0, right: 0, top: 366, textAlign: 'center' },
  inView: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter,
    bottom: 112,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inViewThumb: { width: 56, height: 56, borderRadius: 16, overflow: 'hidden', backgroundColor: '#F4C4B0' },
  inViewCopy: { flex: 1, gap: 2 },
  mapHeader: { gap: 10 },
  map: { position: 'absolute', left: 0, top: 0 },
  mapSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mapSearch: { flex: 1, paddingHorizontal: 16 },
  filterScroll: { flexGrow: 0, marginHorizontal: -space.gutter },
  filters: { gap: 8, paddingHorizontal: space.gutter },
  zoom: { position: 'absolute', right: space.gutter },
  zoomRule: { height: 1, backgroundColor: 'rgba(14,17,22,0.1)' },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 108,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(14,17,22,0.2)' },
});
