# Automatic collection on iOS

In Profile, enable **Automatic collection → Enable visits and photo uploads**.
Grant Always location access and Photos access. Full Photos access includes future
photos automatically; Limited access only includes the photos iOS makes available.
The feature starts when enabled; it does not import earlier location history or
scan photos taken before that point.

This requires a rebuilt iOS development or production app with `expo-task-manager`
and `expo-media-library`. Expo Go cannot exercise the background location flow.
The Expo config plugins provide the background mode and permission descriptions;
do not edit generated native projects.

## Matching and sharing

- A location visit requires two reliable readings at least one minute apart,
  no more than five minutes apart, within 150 metres including reported accuracy.
  Readings with accuracy worse than 75 metres or speed above 2.5 m/s do not count.
- A geotagged photo within 150 metres can establish a visit directly. The closest
  landmark must be at least 40 metres closer than another candidate, otherwise the
  match is skipped. This is proximity matching, not visual landmark recognition.
- New automatic visits are private. Photos appended to an existing visit follow
  that visit's current sharing setting. Existing notes, dates, companions, and
  photos are preserved. The ten-photo limit still applies.
- Photos are resized and encoded with the existing JPEG upload pipeline. Photo
  GPS coordinates are used for matching and are not stored on the visit.
- The server deduplicates automatic photo attachments using a hash of the local
  asset ID. Turning collection off or signing out revokes the device credential
  and stops the native tasks.

## Scheduling and limits

iOS decides when background events run. A photo-library change does not itself
wake a suspended app: location/geofence events can sync photos, and the app also
resumes work on foregrounding and while open. Force-quitting, revoking permissions,
poor GPS, connectivity, or the OS suspending work can delay or miss detection.

Monitoring registers at most nineteen nearby, uncollected landmarks and one travel
region, within iOS's twenty-region limit. Lower-power updates are used away from
landmarks; precise readings run for at most three minutes near a candidate.
Recent location readings use a short, encrypted retry queue (eight samples).
Older location-only visits can be missed during prolonged offline travel. Photos
remain in the library and retry from the saved scan checkpoint after failures.

Nearby catalog discovery currently reads at most 2,000 landmarks in a latitude
band and examines at most eighty nearby candidates. A larger catalog may need a
spatial index before this can promise full coverage in every area.

## Device verification

Automated tests exercise backend ownership/revocation, dwell rules, matching,
private collection, preservation of existing details, duplicate protection, and
mocked iOS queue/upload behavior. They do not prove actual Core Location delivery.
Before release, verify on a physical iPhone with a rebuilt app:

1. Enable collection, grant Always + Full Photos, then background/lock the phone.
2. Walk to an unambiguous catalog landmark and remain there for over a minute.
   Confirm its visit appears without tapping a check-in button.
3. Take a geotagged photo there. Trigger another location event or reopen the app;
   confirm the photo attaches once, with the expected sharing setting.
4. Interrupt an upload with airplane mode and resume; confirm no duplicate photo.
5. Try Limited Photos, revoked location access, and force-quitting; confirm the
   settings explain the state and foregrounding resumes permitted work.
6. Turn collection off and sign out; confirm native location tasks stop and the
   old credential can no longer record or attach photos.
