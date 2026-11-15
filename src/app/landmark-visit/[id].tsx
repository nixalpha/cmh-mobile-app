import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { ConvexError } from 'convex/values';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AsyncButton, errorMessage, Notice } from '@/components/live-ui';
import { personName } from '@/components/live-post';
import { SheetRow } from '@/components/sheet-row';
import { Chip } from '@/components/ui/chip';
import { Glass } from '@/components/ui/glass';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { colors, fonts, radius } from '@/constants/theme';
import { api, type Id } from '@/lib/backend';
import { daysAgo, localDay } from '@/lib/exif';
import { preparePhoto, uploadPhoto } from '@/lib/photo-upload';

const MAX_PHOTOS = 10;
const MAX_NOTE = 1000;
const MAX_COMPANIONS = 20;

type Sheet = NonNullable<FunctionReturnType<typeof api.landmarkVisits.get>>;
type Person = { _id: Id<'users'>; handle: string | null; displayName: string | null };
type NewPhoto = {
  storageId: Id<'_storage'>;
  width: number;
  height: number;
  takenAt?: number;
  lat?: number;
  lng?: number;
};
type Photo =
  | { key: string; kind: 'saved'; id: Id<'landmarkPhotos'>; uri: string }
  | { key: string; kind: 'new'; uri: string; status: 'uploading' | 'failed' }
  | { key: string; kind: 'new'; uri: string; status: 'ready'; upload: NewPhoto; day: string | null };

export default function LandmarkVisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const landmarkId = typeof id === 'string' && /^[a-z0-9]{32}$/i.test(id) ? (id as Id<'landmarks'>) : null;
  const sheet = useQuery(api.landmarkVisits.get, landmarkId ? { landmarkId } : 'skip');

  if (!landmarkId || sheet === null) return <Message text="This landmark isn’t available." />;
  if (sheet === undefined) return <Message text="Loading landmark…" />;
  if (!sheet.destinationVisited) return <Message text={`Add ${sheet.destinationName} to your visits before collecting its landmarks.`} />;
  return <VisitForm key={landmarkId} sheet={sheet} />;
}

function Message({ text }: { text: string }) {
  return (
    <Screen backdrop="place">
      <View style={styles.bar}>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
      </View>
      <Notice>{text}</Notice>
    </Screen>
  );
}

function dayLabel(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function parseDay(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

function VisitForm({ sheet }: { sheet: Sheet }) {
  const save = useMutation(api.landmarkVisits.save);
  const generateUploadUrl = useMutation(api.landmarkVisits.generateUploadUrl);
  const mine = sheet.mine;

  const [companions, setCompanions] = useState<Person[]>(mine?.companions ?? []);
  const [findingFriends, setFindingFriends] = useState(false);
  const [friendQuery, setFriendQuery] = useState('');
  const friends = usePaginatedQuery(api.friends.list, {}, { initialNumItems: 50 });

  const [note, setNote] = useState(mine?.note ?? '');
  const [writingNote, setWritingNote] = useState(!!mine?.note);

  const [photos, setPhotos] = useState<Photo[]>(
    mine?.photos.map((photo) => ({ key: photo._id, kind: 'saved' as const, id: photo._id, uri: photo.url })) ?? [],
  );
  const [photoError, setPhotoError] = useState('');

  const [chosenDay, setChosenDay] = useState<string | null>(mine?.visitedOn ?? null);
  // Until the person picks a date, the earliest photo's capture day fills it in.
  const [dateTouched, setDateTouched] = useState(mine?.visitedOn != null);
  const [pickingDate, setPickingDate] = useState(false);

  const [stealth, setStealth] = useState(mine?.stealth ?? false);

  // The earliest capture day among newly added photos, offered as a date suggestion.
  const today = localDay(new Date());
  const photoDay = photos
    .flatMap((photo) => (photo.kind === 'new' && photo.status === 'ready' && photo.day && photo.day <= today ? [photo.day] : []))
    .sort()[0] ?? null;
  const visitedOn = dateTouched ? chosenDay : (photoDay ?? chosenDay);
  const uploading = photos.some((photo) => photo.kind === 'new' && photo.status === 'uploading');
  const failed = photos.some((photo) => photo.kind === 'new' && photo.status === 'failed');

  const chooseDay = (day: string | null) => {
    setDateTouched(true);
    setChosenDay(day);
  };

  const toggleCompanion = (person: Person) => {
    setCompanions((current) =>
      current.some((p) => p._id === person._id)
        ? current.filter((p) => p._id !== person._id)
        : current.length >= MAX_COMPANIONS
          ? current
          : [...current, person],
    );
  };

  const updatePhoto = (key: string, next: Photo) => {
    setPhotos((current) => current.map((photo) => (photo.key === key ? next : photo)));
  };

  const addPhotos = async () => {
    setPhotoError('');
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      exif: true,
      quality: 1,
    });
    if (result.canceled) return;
    const picked = result.assets.slice(0, remaining).map((asset, i) => ({
      asset,
      key: `${Date.now()}-${i}-${asset.assetId ?? asset.uri}`,
    }));
    setPhotos((current) => [
      ...current,
      ...picked.map(({ asset, key }) => ({ key, kind: 'new' as const, uri: asset.uri, status: 'uploading' as const })),
    ]);
    await Promise.all(
      picked.map(async ({ asset, key }) => {
        try {
          const prepared = await preparePhoto(asset);
          const storageId = await uploadPhoto(await generateUploadUrl(), prepared.uri);
          const day = prepared.takenAt?.day ?? null;
          updatePhoto(key, {
            key,
            kind: 'new',
            uri: prepared.uri,
            status: 'ready',
            day,
            upload: {
              storageId,
              width: prepared.width,
              height: prepared.height,
              takenAt: prepared.takenAt?.timestamp,
              lat: prepared.location?.lat,
              lng: prepared.location?.lng,
            },
          });
        } catch (cause) {
          updatePhoto(key, { key, kind: 'new', uri: asset.uri, status: 'failed' });
          setPhotoError(cause instanceof ConvexError ? errorMessage(cause) : 'A photo couldn’t be uploaded. Remove it and try again.');
        }
      }),
    );
  };

  const submit = async () => {
    if (failed) throw new ConvexError({ message: 'Remove the photos that failed to upload, then try again.' });
    await save({
      landmarkId: sheet.landmark._id,
      visitedOn: visitedOn ?? undefined,
      note: note.trim() || undefined,
      companionIds: companions.map((person) => person._id),
      keepPhotoIds: photos.flatMap((photo) => (photo.kind === 'saved' ? [photo.id] : [])),
      newPhotos: photos.flatMap((photo) => (photo.kind === 'new' && photo.status === 'ready' ? [photo.upload] : [])),
      stealth,
    });
    router.back();
  };

  // Selected friends first, then the rest of the loaded list, filtered while searching.
  const query = friendQuery.trim().toLowerCase();
  const selectedIds = new Set(companions.map((p) => p._id));
  const friendChips = [...companions, ...friends.results.filter((f) => !selectedIds.has(f._id))].filter(
    (person) => !query || personName(person).toLowerCase().includes(query) || person.handle?.includes(query),
  );

  const quickDays = [
    { day: daysAgo(0), label: 'Today' },
    { day: daysAgo(1), label: 'Yesterday' },
    { day: daysAgo(2), label: '2 days ago' },
  ];
  const extraDays = [
    ...(photoDay && !quickDays.some((q) => q.day === photoDay) ? [{ day: photoDay, label: `From photo (${dayLabel(photoDay)})` }] : []),
    ...(visitedOn && visitedOn !== photoDay && !quickDays.some((q) => q.day === visitedOn) ? [{ day: visitedOn, label: dayLabel(visitedOn) }] : []),
  ];

  return (
    <Screen backdrop="place" scroll>
      <Glass radius={radius.card} style={styles.header}>
        <View style={styles.headerCopy}>
          <Text variant="heading" accessibilityRole="header" numberOfLines={2}>{sheet.landmark.name}</Text>
          <Text variant="meta" color="muted" numberOfLines={1}>{sheet.landmark.category} · {sheet.destinationName}</Text>
        </View>
        <IconButton icon="close" label="Close without saving" variant="plain" onPress={() => router.back()} />
      </Glass>

      <Glass radius={radius.card} style={styles.rows}>
        <SheetRow
          icon="users"
          title="Who did you go with?"
          subtitle={companions.length > 0 ? companions.map(personName).join(', ') : undefined}
          onPress={() => setFindingFriends((open) => !open)}>
          {findingFriends && (
            <SearchField placeholder="Search friends" value={friendQuery} onChangeText={setFriendQuery} height={44} />
          )}
          {friends.status === 'LoadingFirstPage' ? (
            <Notice>Loading friends…</Notice>
          ) : friendChips.length === 0 ? (
            <Notice>{query ? 'No friends match that search.' : 'Add friends to tag who you went with.'}</Notice>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} style={styles.bleed}>
              {friendChips.map((person) => (
                <Chip
                  key={person._id}
                  label={personName(person)}
                  check
                  surface="tile"
                  selected={selectedIds.has(person._id)}
                  onPress={() => toggleCompanion(person)}
                />
              ))}
            </ScrollView>
          )}
        </SheetRow>

        <SheetRow
          icon="note"
          title={note.trim() ? 'Notes' : 'Add notes'}
          subtitle={!writingNote && note.trim() ? note.trim() : undefined}
          onPress={() => setWritingNote((open) => !open)}>
          {writingNote && (
            <View style={styles.noteBox}>
              <TextInput
                value={note}
                onChangeText={(text) => setNote(text.slice(0, MAX_NOTE))}
                placeholder="What stood out? Tips for friends?"
                placeholderTextColor={colors.muted}
                multiline
                autoFocus={!mine?.note}
                accessibilityLabel="Notes"
                style={styles.noteInput}
              />
              <Text variant="caption" color="muted" style={styles.counter}>{note.length}/{MAX_NOTE}</Text>
            </View>
          )}
        </SheetRow>

        <SheetRow
          icon="photo"
          title={photos.length > 0 ? `Photos (${photos.length}/${MAX_PHOTOS})` : 'Add photos'}
          onPress={photos.length < MAX_PHOTOS ? addPhotos : undefined}>
          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} style={styles.bleed}>
              {photos.map((photo) => (
                <View key={photo.key} style={styles.thumb}>
                  <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={photo.key} />
                  {photo.kind === 'new' && photo.status === 'uploading' && (
                    <View style={styles.thumbOverlay}><ActivityIndicator color={colors.white} /></View>
                  )}
                  {photo.kind === 'new' && photo.status === 'failed' && (
                    <View style={[styles.thumbOverlay, styles.thumbFailed]}><Text variant="micro" color="white" weight="bold">Failed</Text></View>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    hitSlop={8}
                    onPress={() => setPhotos((current) => current.filter((p) => p.key !== photo.key))}
                    style={styles.remove}>
                    <Icon name="close" size={12} color={colors.white} strokeWidth={3} />
                  </Pressable>
                </View>
              ))}
              {photos.length < MAX_PHOTOS && (
                <Pressable accessibilityRole="button" accessibilityLabel="Add more photos" onPress={addPhotos} style={[styles.thumb, styles.addThumb]}>
                  <Icon name="plus" size={22} color={colors.slate} />
                </Pressable>
              )}
            </ScrollView>
          )}
          {!!photoError && <Notice>{photoError}</Notice>}
        </SheetRow>

        <SheetRow
          icon="calendar"
          title={visitedOn ? `Visited ${dayLabel(visitedOn)}` : 'Add visit date'}
          subtitle={visitedOn && visitedOn === photoDay && !dateTouched ? 'From your photo' : undefined}
          onPress={() => setPickingDate((open) => !open)}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} style={styles.bleed}>
            {[...extraDays, ...quickDays].map(({ day, label }) => (
              <Chip
                key={`${label}-${day}`}
                label={label}
                surface="tile"
                selected={visitedOn === day}
                onPress={() => chooseDay(visitedOn === day ? null : day)}
              />
            ))}
          </ScrollView>
          {pickingDate && (
            <DateTimePicker
              value={visitedOn ? parseDay(visitedOn) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={new Date()}
              minimumDate={new Date(1900, 0, 1)}
              accentColor={colors.ink}
              onValueChange={(_, date) => {
                chooseDay(localDay(date));
                if (Platform.OS !== 'ios') setPickingDate(false);
              }}
              onDismiss={() => setPickingDate(false)}
            />
          )}
        </SheetRow>

        <SheetRow
          icon="lock"
          title="Stealth mode"
          subtitle="Hide this activity from the newsfeed"
          last
          trailing={
            <Switch
              value={stealth}
              onValueChange={setStealth}
              accessibilityLabel="Stealth mode"
              trackColor={{ true: colors.ink, false: colors.inkTint }}
            />
          }
        />
      </Glass>

      <AsyncButton label={uploading ? 'Uploading photos…' : 'Okay'} disabled={uploading} onPress={submit} />
      <Text variant="caption" color="muted" style={styles.footnote}>
        Photos are resized and their location data is removed before upload. A photo taken at the landmark marks this visit as photo-verified.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'flex-end' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 18, paddingLeft: 20, paddingRight: 8 },
  headerCopy: { flex: 1, gap: 2 },
  rows: { paddingHorizontal: 20, paddingVertical: 4 },
  bleed: { marginHorizontal: -20 },
  strip: { gap: 8, paddingHorizontal: 20 },
  noteBox: { borderRadius: radius.tile, backgroundColor: colors.tileStrong, padding: 14, gap: 6 },
  noteInput: { minHeight: 96, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.ink, textAlignVertical: 'top', padding: 0 },
  counter: { alignSelf: 'flex-end' },
  thumb: { width: 76, height: 76, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.inkTint },
  thumbOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,17,22,0.35)' },
  thumbFailed: { backgroundColor: 'rgba(217,83,63,0.7)' },
  remove: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,17,22,0.6)',
  },
  addThumb: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.inkFaint, backgroundColor: 'transparent' },
  footnote: { paddingHorizontal: 4 },
});
