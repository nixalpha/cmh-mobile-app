/**
 * Reads the capture date and GPS position from the EXIF that expo-image-picker returns.
 * iOS nests groups (`{Exif}`, `{TIFF}`, `{GPS}`) while Android returns flat tags, so every
 * lookup checks both layouts.
 */
export type Exif = Record<string, unknown> | null | undefined;

const DATE_TAGS = ['DateTimeOriginal', 'DateTimeDigitized', 'DateTime'] as const;
const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

function group(exif: Exif, name: string): Record<string, unknown> | null {
  const value = exif?.[name];
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function lookup(exif: Exif, tag: string, groups: readonly string[]) {
  if (exif?.[tag] !== undefined) return exif[tag];
  for (const name of groups) {
    const value = group(exif, name)?.[tag];
    if (value !== undefined) return value;
  }
  return undefined;
}

export type TakenAt = {
  /** Local capture time as epoch milliseconds, interpreted in the device's time zone. */
  timestamp: number;
  /** The capture day exactly as the camera recorded it, `YYYY-MM-DD`. */
  day: string;
};

export function photoTakenAt(exif: Exif): TakenAt | null {
  for (const tag of DATE_TAGS) {
    const raw = lookup(exif, tag, ['{Exif}', '{TIFF}']);
    const match = typeof raw === 'string' ? EXIF_DATE.exec(raw) : null;
    if (!match) continue;
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    const date = new Date(year, month - 1, day, hour, minute, second);
    if (Number.isNaN(date.getTime()) || year < 1900) continue;
    return { timestamp: date.getTime(), day: `${match[1]}-${match[2]}-${match[3]}` };
  }
  return null;
}

function toDegrees(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parts = value.split(/[,\s]+/).filter(Boolean).map(rational);
    if (parts.length === 1) return parts[0];
    if (parts.length === 3 && parts.every((p) => p !== null)) return parts[0]! + parts[1]! / 60 + parts[2]! / 3600;
    return null;
  }
  if (Array.isArray(value) && value.length === 3) {
    const [d, m, s] = value.map((v) => toDegrees(v));
    return d === null || m === null || s === null ? null : d + m / 60 + s / 3600;
  }
  return null;
}

function rational(text: string): number | null {
  const [num, den] = text.split('/').map(Number);
  const value = den === undefined ? num : num / den;
  return Number.isFinite(value) ? value : null;
}

function signed(value: number | null, ref: unknown, negative: string) {
  if (value === null) return null;
  if (typeof ref !== 'string' || ref === '') return value;
  return ref.toUpperCase().startsWith(negative) ? -Math.abs(value) : Math.abs(value);
}

export function photoLocation(exif: Exif): { lat: number; lng: number } | null {
  const gps = group(exif, '{GPS}');
  const lat = signed(
    toDegrees(gps?.Latitude ?? exif?.GPSLatitude),
    gps?.LatitudeRef ?? exif?.GPSLatitudeRef,
    'S',
  );
  const lng = signed(
    toDegrees(gps?.Longitude ?? exif?.GPSLongitude),
    gps?.LongitudeRef ?? exif?.GPSLongitudeRef,
    'W',
  );
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // Cameras without a fix sometimes write 0,0.
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** Local calendar day `YYYY-MM-DD` for a date, matching what the backend expects. */
export function localDay(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function daysAgo(n: number, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() - n);
  return localDay(date);
}
