import { useQuery } from 'convex/react';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Globe } from '@/components/globe';
import { IconButton } from '@/components/ui/icon-button';
import { space } from '@/constants/theme';
import { api } from '@/lib/backend';
import type { GlobePlace } from '@/lib/globe-bridge';

const PLACES: readonly GlobePlace[] = [];

export function DiscoverMap({ active }: { active: boolean }) {
  const insets = useSafeAreaInsets();
  const places = useQuery(api.destinations.popular, { limit: 20 });
  const [selectedId, setSelectedId] = useState<string>();
  const [focusRevision, setFocusRevision] = useState(0);
  const [zoomOutRevision, setZoomOutRevision] = useState(0);
  const selectPlace = useCallback((id: string) => {
    setSelectedId(id);
    setFocusRevision((revision) => revision + 1);
  }, []);

  return (
    <View style={styles.map}>
      <Globe
        active={active}
        places={places ?? PLACES}
        selectedId={selectedId}
        focusRevision={focusRevision}
        zoomOutRevision={zoomOutRevision}
        onSelectPlace={selectPlace}
      />
      <IconButton
        icon="minus"
        label="Return to globe view"
        variant="ink"
        onPress={() => {
          setSelectedId(undefined);
          setZoomOutRevision((revision) => revision + 1);
        }}
        style={[styles.zoomOut, {
          top: insets.top + space.screenTop,
          right: insets.right + space.gutter,
        }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  zoomOut: { position: 'absolute' },
});
