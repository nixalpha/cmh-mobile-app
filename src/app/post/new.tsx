import { useMutation, usePaginatedQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AsyncButton, errorMessage, Notice } from '@/components/live-ui';
import { Chip } from '@/components/ui/chip';
import { Glass } from '@/components/ui/glass';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { colors, fonts, radius, space } from '@/constants/theme';
import { api, type Id } from '@/lib/backend';
import { localDay, photoTakenAt } from '@/lib/exif';
import { CITY_RADIUS_KM } from '@/lib/import-city-photos';
import { photoLibrarySupported, readLocatedPhotos, uploadLibraryPhoto, type LibraryPhoto } from '@/lib/photo-library';
import { preparePhoto, uploadPhoto } from '@/lib/photo-upload';

const MAX_PHOTOS = 10;
const MAX_NOTE = 1000;
const GRID_LIMIT = 300;

type City = { _id: Id<'destinations'>; name: string; countryName: string; lat: number; lng: number };
type Picked =
  | { key: string; uri: string; takenAt: number | null; kind: 'library'; photo: LibraryPhoto }
  | { key: string; uri: string; takenAt: number | null; kind: 'picker'; asset: ImagePicker.ImagePickerAsset };

export default function NewPostScreen() {
  const { place } = useLocalSearchParams<{ place?: string }>();
  const visits = usePaginatedQuery(api.places.visits, {}, { initialNumItems: 50 });
  const cities: City[] = visits.results.map((visit) => visit.destination);
  const [cityId, setCityId] = useState<string | null>(typeof place === 'string' ? place : null);
  const city = cities.find((item) => item._id === cityId) ?? null;
  const [picked, setPicked] = useState<Picked[]>([]);
  const [note, setNote] = useState('');
  const create = useMutation(api.posts.create);
  const generateUploadUrl = useMutation(api.landmarkVisits.generateUploadUrl);

  const chooseCity = (next: City) => {
    if (next._id === cityId) return;
    setCityId(next._id);
    setPicked([]);
  };
  const toggle = (item: Picked) => setPicked((current) =>
    current.some((p) => p.key === item.key) ? current.filter((p) => p.key !== item.key)
      : current.length < MAX_PHOTOS ? [...current, item] : current);

  const pickOther = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS - picked.length, exif: true, quality: 1,
    });
    if (result.canceled) return;
    const added: Picked[] = result.assets.map((asset, i) => ({
      key: `picker-${asset.assetId ?? asset.uri}-${i}`, uri: asset.uri, kind: 'picker', asset,
      takenAt: photoTakenAt(asset.exif)?.timestamp ?? null,
    }));
    setPicked((current) => [...current, ...added.filter((a) => !current.some((p) => p.key === a.key))].slice(0, MAX_PHOTOS));
  };

  const earliest = picked.flatMap((p) => (p.takenAt === null ? [] : [p.takenAt])).sort((a, b) => a - b)[0];
  const takenOn = earliest === undefined ? undefined : localDay(new Date(earliest));

  const submit = async () => {
    if (!city) throw new ConvexError({ message: 'Pick a place first.' });
    if (picked.length === 0) throw new ConvexError({ message: 'Pick at least one photo.' });
    const photos = [];
    for (const item of picked) {
      try {
        const url = await generateUploadUrl();
        if (item.kind === 'library') {
          photos.push({ ...(await uploadLibraryPhoto(item.photo, url)), takenAt: item.takenAt ?? undefined });
        } else {
          const prepared = await preparePhoto(item.asset);
          photos.push({ storageId: await uploadPhoto(url, prepared.uri), width: prepared.width, height: prepared.height, takenAt: item.takenAt ?? undefined });
        }
      } catch (cause) {
        throw cause instanceof ConvexError ? cause : new ConvexError({ message: 'A photo couldn’t be uploaded. Remove it and try again.' });
      }
    }
    await create({ destinationId: city._id, photos, takenOn, note: note.trim() || undefined });
    router.back();
  };

  return (
    <Screen backdrop="place" scroll>
      <Glass radius={radius.card} style={styles.header}>
        <Text variant="heading" accessibilityRole="header" style={styles.headerTitle}>New post</Text>
        <IconButton icon="close" label="Close without posting" variant="plain" onPress={() => router.back()} />
      </Glass>

      <View style={styles.section}>
        <Text variant="label" color="muted">Where</Text>
        {visits.status === 'LoadingFirstPage' ? <Notice>Loading your places…</Notice>
          : cities.length === 0 ? <Notice>Add a place you’ve been to before posting from it.</Notice> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
              {cities.map((item) => (
                <Chip key={item._id} label={item.name} check surface="tile" selected={item._id === cityId} onPress={() => chooseCity(item)} />
              ))}
            </ScrollView>
          )}
      </View>

      {city && (
        <View style={styles.section}>
          <Text variant="label" color="muted">
            {picked.length > 0 ? `${picked.length}/${MAX_PHOTOS} photos` : `Your photos from ${city.name}`}
            {takenOn ? ` · ${dayLabel(takenOn)}` : ''}
          </Text>
          {photoLibrarySupported && <CityPhotos key={city._id} city={city} picked={picked} onToggle={toggle} />}
          {picked.length < MAX_PHOTOS && (
            <AsyncButton label="Choose other photos" variant="secondary" onPress={pickOther} />
          )}
          {picked.some((p) => p.kind === 'picker') && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
              {picked.filter((p) => p.kind === 'picker').map((item) => (
                <Pressable key={item.key} accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => toggle(item)} style={styles.thumb}>
                  <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={item.key} />
                  <View style={styles.selectedMark}><Icon name="check" size={12} color={colors.white} strokeWidth={3} /></View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {city && (
        <Glass radius={radius.card} style={styles.noteBox}>
          <TextInput
            value={note}
            onChangeText={(text) => setNote(text.slice(0, MAX_NOTE))}
            placeholder="Say something about it"
            placeholderTextColor={colors.muted}
            multiline
            accessibilityLabel="Note"
            style={styles.noteInput}
          />
        </Glass>
      )}

      {city && <AsyncButton label="Post" disabled={picked.length === 0} onPress={submit} />}
      <Text variant="caption" color="muted" style={styles.footnote}>
        Your post is dated from your earliest photo. Photos are resized and their location data is removed before upload.
      </Text>
    </Screen>
  );
}

function CityPhotos({ city, picked, onToggle }: { city: City; picked: Picked[]; onToggle: (item: Picked) => void }) {
  const [photos, setPhotos] = useState<LibraryPhoto[] | null | undefined>(undefined);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    readLocatedPhotos({ near: { lat: city.lat, lng: city.lng, radiusKm: CITY_RADIUS_KM }, limit: GRID_LIMIT })
      .then((found) => { if (active) setPhotos(found); })
      .catch((cause) => { if (active) { setPhotos([]); setError(errorMessage(cause)); } });
    return () => { active = false; };
  }, [city.lat, city.lng]);

  if (photos === undefined) return <View style={styles.loading}><ActivityIndicator color={colors.slate} /></View>;
  if (photos === null) return <Notice>Allow photo access to pick photos from {city.name}.</Notice>;
  if (error) return <Notice>{error}</Notice>;
  if (photos.length === 0) return <Notice>No photos taken in {city.name} were found.</Notice>;
  const selected = new Set(picked.map((p) => p.key));
  return (
    <View style={styles.grid}>
      {photos.map((photo) => {
        const item: Picked = { key: `library-${photo.id}`, uri: photo.uri, takenAt: photo.takenAt, kind: 'library', photo };
        const on = selected.has(item.key);
        return (
          <Pressable
            key={photo.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Photo from ${new Date(photo.takenAt).toLocaleDateString()}`}
            onPress={() => onToggle(item)}
            style={[styles.cell, on && styles.cellOn]}>
            <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={photo.id} />
            {on && <View style={styles.selectedMark}><Icon name="check" size={12} color={colors.white} strokeWidth={3} /></View>}
          </Pressable>
        );
      })}
    </View>
  );
}

function dayLabel(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 18, paddingLeft: 20, paddingRight: 8 },
  headerTitle: { flex: 1 },
  section: { gap: space.stack },
  strip: { gap: 8 },
  loading: { paddingVertical: space.inset, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: '32.6%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.inkTint },
  cellOn: { opacity: 0.85 },
  thumb: { width: 76, height: 76, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.inkTint },
  selectedMark: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink,
  },
  noteBox: { padding: 14 },
  noteInput: { minHeight: 72, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.ink, textAlignVertical: 'top', padding: 0 },
  footnote: { paddingHorizontal: 4 },
});
