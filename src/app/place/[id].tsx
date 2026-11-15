import { useMutation, useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AsyncButton, Notice, PhotoCredit, PlaceArt } from '@/components/live-ui';
import { Button } from '@/components/ui/button';
import { Glass } from '@/components/ui/glass';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { api, type Id } from '@/lib/backend';

export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const destinationId = typeof id === 'string' && /^[a-z0-9]{32}$/i.test(id) ? id as Id<'destinations'> : null;
  const catalog = useQuery(api.destinations.get, destinationId ? { destinationId } : 'skip');
  const detail = useQuery(api.places.destination, destinationId && catalog ? { destinationId } : 'skip');
  const landmarks = useQuery(api.places.landmarkProgress, destinationId && catalog ? { destinationId } : 'skip');
  const save = useMutation(api.places.save);
  const unsave = useMutation(api.places.unsave);
  const addVisit = useMutation(api.places.addVisit);
  const lock = useMutation(api.places.lockLandmark);

  return (
    <Screen backdrop="place" scroll>
      <View style={styles.bar}>
        <IconButton icon="arrowLeft" label="Back" onPress={() => router.back()} />
        <Text variant="cardTitle">Place details</Text>
      </View>
      {!destinationId || catalog === null ? <Notice>Place not found.</Notice> : !detail ? <Notice>Loading place…</Notice> : (
        <>
          <PlaceArt place={detail.destination} height={200} />
          <PhotoCredit image={detail.destination.image} />
          <Glass style={styles.card}>
            <Text variant="eyebrow" color="muted">{detail.destination.countryName} · {detail.destination.kind}</Text>
            <Text variant="title" accessibilityRole="header">{detail.destination.name}</Text>
            {detail.destination.admin1 && <Text color="slate">{detail.destination.admin1}</Text>}
            {detail.viewer.rank !== null && <Text variant="cardTitle">Your #{detail.viewer.rank} of {detail.viewer.listSize}</Text>}
            {detail.friends.visitedCount > 0 && (
              <Text color="slate">{detail.friends.visitedCount} friends have visited</Text>
            )}
            {detail.friends.averageScore !== null && (
              <Text variant="caption" color="muted">Friends’ average score: {detail.friends.averageScore.toFixed(1)}</Text>
            )}
            {detail.viewer.visit ? <Notice>In your visited places</Notice> : (
              <AsyncButton label="I’ve been here" onPress={() => addVisit({ destinationId })} />
            )}
            {detail.viewer.rank === null && (
              <Button label="Rank this place" icon="rank" onPress={() => router.push({ pathname: '/rank/[id]', params: { id: destinationId } })} />
            )}
            <AsyncButton
              label={detail.viewer.saved ? 'Remove from want to go' : 'Want to go'}
              variant="secondary"
              onPress={() => detail.viewer.saved ? unsave({ destinationId }) : save({ destinationId })}
            />
          </Glass>
          <View style={styles.landmarks}>
            <Text variant="title2">Landmarks</Text>
            <Text color="slate">{detail.viewer.visit?.unlockCount ?? 0} collected · {detail.destination.landmarkCount} in the catalog</Text>
            <Text variant="caption" color="muted">Mark places you’ve visited by hand. Landmarks are self-reported unless you attach a photo taken there.</Text>
            {!detail.viewer.visit && <Notice>Add this place to your visits to unlock its landmarks.</Notice>}
            {landmarks === undefined ? <Notice>Loading landmarks…</Notice> : landmarks.length === 0 ? <Notice>No landmarks in this catalog yet.</Notice> : landmarks.map(({ landmark, unlocked, verification, friendsUnlocked, photoCount, coverUrl }) => {
              const openVisit = () => router.push({ pathname: '/landmark-visit/[id]', params: { id: landmark._id } });
              return (
                <Glass key={landmark._id} style={styles.card}>
                  <View style={styles.landmarkRow}>
                    {coverUrl && (
                      <Image source={{ uri: coverUrl }} style={styles.cover} contentFit="cover" recyclingKey={landmark._id} accessibilityLabel={`Your photo of ${landmark.name}`} />
                    )}
                    <View style={styles.landmarkCopy}>
                      <Text variant="cardTitle">{landmark.name}</Text>
                      <Text variant="caption" color="muted">{landmark.category}</Text>
                      <Text color="slate">
                        {unlocked ? (verification === 'photo' ? 'Collected · photo-verified' : 'Collected') : 'Not collected'}
                        {photoCount > 0 ? ` · ${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}` : ''}
                      </Text>
                    </View>
                  </View>
                  {friendsUnlocked > 0 && <Text variant="caption" color="muted">{friendsUnlocked} friends collected this</Text>}
                  {detail.viewer.visit && (unlocked ? (
                    <>
                      <Button label="Edit visit" variant="secondary" onPress={openVisit} />
                      <AsyncButton label="Mark as not visited" variant="link" onPress={() => lock({ landmarkId: landmark._id })} />
                    </>
                  ) : (
                    <Button label="I visited this landmark" variant="secondary" onPress={openVisit} />
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

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { padding: 20, gap: 12 },
  landmarks: { gap: 12 },
  landmarkRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  landmarkCopy: { flex: 1, gap: 4 },
  cover: { width: 64, height: 64, borderRadius: 14 },
});
