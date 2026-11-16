import { useConvex, useMutation, useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AsyncButton, AsyncIconButton, Notice, PhotoCredit, PlaceArt } from '@/components/live-ui';
import { Button } from '@/components/ui/button';
import { Glass } from '@/components/ui/glass';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { api, type Id } from '@/lib/backend';
import { importCityPhotos } from '@/lib/import-city-photos';
import { photoLibrarySupported } from '@/lib/photo-library';
import { colors, radius, space } from '@/constants/theme';

export default function PlaceScreen() {
  const { id, landmark: focusedLandmark } = useLocalSearchParams<{ id: string; landmark?: string }>();
  const destinationId = typeof id === 'string' && /^[a-z0-9]{32}$/i.test(id) ? id as Id<'destinations'> : null;
  const catalog = useQuery(api.destinations.get, destinationId ? { destinationId } : 'skip');
  const detail = useQuery(api.places.destination, destinationId && catalog ? { destinationId } : 'skip');
  const landmarks = useQuery(api.places.landmarkProgress, destinationId && catalog ? { destinationId } : 'skip');
  const save = useMutation(api.places.save);
  const unsave = useMutation(api.places.unsave);
  const addVisit = useMutation(api.places.addVisit);
  const lock = useMutation(api.places.lockLandmark);
  const [saveError, setSaveError] = useState('');
  const importNote = usePhotoImport(detail, landmarks);
  // Arriving from a landmark pin on the map: bring that landmark's card into view once it is laid out.
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<{ list?: number; card?: number; done?: boolean }>({});
  const revealLandmark = (offset: { list?: number; card?: number }) => {
    const next = Object.assign(offsets.current, offset);
    if (next.done || next.list === undefined || next.card === undefined) return;
    next.done = true;
    scroll.current?.scrollTo({ y: Math.max(0, next.list + next.card - space.stack), animated: true });
  };

  return (
    <Screen backdrop="place" scroll scrollRef={scroll} headerActions={<>
        <IconButton icon="arrowLeft" label="Back" onPress={() => router.back()} />
        {destinationId && detail && (
          <AsyncIconButton
            icon={detail.viewer.saved ? 'bookmarkFilled' : 'bookmark'}
            label={detail.viewer.saved ? 'Remove from want to go' : 'Want to go'}
            selected={detail.viewer.saved}
            onError={setSaveError}
            onPress={async () => {
              setSaveError('');
              await (detail.viewer.saved ? unsave({ destinationId }) : save({ destinationId }));
            }}
          />
        )}
      </>}>
      {!!saveError && <Notice>{saveError}</Notice>}
      {!destinationId || catalog === null ? <Notice>Place not found.</Notice> : !detail ? <Notice>Loading place…</Notice> : (
        <>
          <PlaceArt place={detail.destination} height={200} />
          <PhotoCredit image={detail.destination.image} />
          <Glass style={styles.card}>
            <Text variant="eyebrow" color="muted">{detail.destination.countryName}</Text>
            <Text variant="title" accessibilityRole="header">{detail.destination.name}</Text>
            {detail.viewer.rank !== null && <Text variant="cardTitle">Your #{detail.viewer.rank}</Text>}
            {detail.friends.visitedCount > 0 && (
              <Text color="slate">{detail.friends.visitedCount} friends have visited</Text>
            )}
            {!detail.viewer.visit && (
              <AsyncButton label="I’ve been here" onPress={() => addVisit({ destinationId })} />
            )}
            {detail.viewer.rank === null && (
              <Button label="Rank this place" icon="rank" onPress={() => router.push({ pathname: '/rank/[id]', params: { id: destinationId } })} />
            )}
          </Glass>
          <View style={styles.landmarks} onLayout={(event) => revealLandmark({ list: event.nativeEvent.layout.y })}>
            <Text variant="title2">Landmarks</Text>
            <Text color="slate">{detail.viewer.visit?.unlockCount ?? 0}/{detail.destination.landmarkCount} collected</Text>
            {!!importNote && <Notice>{importNote}</Notice>}
            {!detail.viewer.visit && <Notice>Mark this place as visited to add landmarks.</Notice>}
            {landmarks === undefined ? <Notice>Loading landmarks…</Notice> : landmarks.length === 0 ? <Notice>No landmarks yet.</Notice> : landmarks.map(({ landmark, unlocked, verification, photoCount, coverUrl }) => {
              const openVisit = () => router.push({ pathname: '/landmark-visit/[id]', params: { id: landmark._id } });
              return (
                <Glass
                  key={landmark._id}
                  style={styles.card}
                  {...(landmark._id === focusedLandmark && {
                    borderColor: colors.accentText,
                    onLayout: (event) => revealLandmark({ card: event.nativeEvent.layout.y }),
                  })}>
                  <View style={styles.landmarkRow}>
                    {coverUrl && (
                      <Image source={{ uri: coverUrl }} style={styles.cover} contentFit="cover" recyclingKey={landmark._id} accessibilityLabel={`Your photo of ${landmark.name}`} />
                    )}
                    <View style={styles.landmarkCopy}>
                      <Text variant="cardTitle">{landmark.name}</Text>
                      {unlocked && (
                        <Text variant="caption" color="muted">
                          {verification === 'photo' ? 'Collected · photo-verified' : 'Collected'}
                          {photoCount > 0 ? ` · ${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}` : ''}
                        </Text>
                      )}
                    </View>
                  </View>
                  {detail.viewer.visit && (unlocked ? (
                    <>
                      <Button label="Edit visit" variant="secondary" onPress={openVisit} />
                      <AsyncButton label="Remove visit" variant="link" onPress={() => lock({ landmarkId: landmark._id })} />
                    </>
                  ) : (
                    <Button label="Add visit" variant="secondary" onPress={openVisit} />
                  ))}
                </Glass>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}

type Detail = ReturnType<typeof useQuery<typeof api.places.destination>>;
type Landmarks = ReturnType<typeof useQuery<typeof api.places.landmarkProgress>>;

/**
 * The first time a visited place opens, adds the camera roll's past photos from it: landmarks
 * they were taken at are collected with those photos, and the rest become a post.
 */
function usePhotoImport(detail: Detail, landmarks: Landmarks) {
  const client = useConvex();
  const [note, setNote] = useState('');
  const started = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const ready = photoLibrarySupported && !!detail?.viewer.visit && !detail.viewer.visit.photosImported && landmarks !== undefined;
  useEffect(() => {
    if (!ready || started.current || !detail || !landmarks) return;
    started.current = true;
    const name = detail.destination.name;
    setNote(`Adding your photos from ${name}…`);
    importCityPhotos(client, detail.destination, landmarks.map(({ landmark }) => landmark))
      .then((result) => {
        if (!mounted.current) return;
        if (result === null) setNote(`Allow photo access to add your photos from ${name}.`);
        else if (result.photos === 0) setNote('');
        else {
          const collected = result.landmarks > 0 ? ` and collected ${result.landmarks} ${result.landmarks === 1 ? 'landmark' : 'landmarks'}` : '';
          setNote(`Added ${result.photos} ${result.photos === 1 ? 'photo' : 'photos'}${collected} from your camera roll.`);
        }
      })
      .catch(() => { if (mounted.current) setNote('Couldn’t add your photos. Open this place again to retry.'); });
  }, [ready, client, detail, landmarks]);
  return note;
}

const styles = StyleSheet.create({
  card: { padding: space.inset, gap: space.stack },
  landmarks: { gap: space.stack },
  landmarkRow: { flexDirection: 'row', gap: space.inset, alignItems: 'center' },
  landmarkCopy: { flex: 1, gap: space.inline },
  cover: { width: 64, height: 64, borderRadius: radius.card },
});
