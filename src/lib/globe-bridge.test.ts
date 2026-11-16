import { describe, expect, it } from 'vitest';

import { isGlobeSync, landmarkRange, parseGlobeEvent, SELF_PLACE_ID, selfPlace, type GlobeSync } from './globe-bridge';

const message: GlobeSync = {
  type: 'sync', active: true, focusRevision: 1, selectedId: 'paris',
  places: [{ _id: 'paris', name: 'Paris', lat: 48.8566, lng: 2.3522 }],
};

describe('cartoon globe bridge', () => {
  it('accepts destination updates with valid geographic coordinates', () => {
    expect(isGlobeSync(message)).toBe(true);
    expect(isGlobeSync({ ...message, selectedId: undefined, places: [] })).toBe(true);
    expect(isGlobeSync({ ...message, zoomOutRevision: 1 })).toBe(true);
    expect(isGlobeSync({ ...message, landmarkId: 'louvre', landmarks: [{ _id: 'louvre', name: 'Louvre', lat: 48.8606, lng: 2.3376 }] })).toBe(true);
  });

  it('rejects malformed data, invalid coordinates and unbounded markers', () => {
    for (const data of [null, {}, { ...message, active: 'yes' }, { ...message, places: [null] },
      { ...message, zoomOutRevision: -1 }, { ...message, zoomOutRevision: NaN },
      { ...message, zoomOutRevision: 1.5 }, { ...message, zoomOutRevision: '1' },
      { ...message, places: [{ ...message.places[0], lat: NaN }] },
      { ...message, places: [{ ...message.places[0], lng: 181 }] },
      { ...message, places: Array(1025).fill(message.places[0]) },
      { ...message, landmarks: 'louvre' }, { ...message, landmarkId: 7 }, { ...message, landmarks: [{ ...message.places[0], lat: 91 }] },
      { ...message, landmarks: Array(51).fill(message.places[0]) }]) expect(isGlobeSync(data)).toBe(false);
  });

  it('accepts person markers and rejects malformed location metadata', () => {
    const person = { ...message.places[0], markerKind: 'friend', initials: 'AL', accuracy: 30 };
    expect(isGlobeSync({ ...message, places: [person] })).toBe(true);
    expect(isGlobeSync({ ...message, places: [{ ...person, markerKind: 'self', initials: 'You' }] })).toBe(true);
    for (const place of [{ ...person, markerKind: 'unknown' }, { ...person, accuracy: Infinity },
      { ...person, accuracy: -1 }, { ...person, initials: '123456789' }]) {
      expect(isGlobeSync({ ...message, places: [place] })).toBe(false);
    }
  });

  it('builds a self marker the globe accepts from any device reading', () => {
    const me = selfPlace({ lat: 37.76, lng: -122.39, accuracy: 35 });
    expect(me).toEqual({ _id: SELF_PLACE_ID, name: 'You', lat: 37.76, lng: -122.39, markerKind: 'self', initials: 'You', accuracy: 35 });
    // iOS reports null accuracy for some fixes and huge values for coarse ones; neither may poison the sync.
    expect(selfPlace({ lat: 1, lng: 2, accuracy: null })?.accuracy).toBeUndefined();
    expect(selfPlace({ lat: 1, lng: 2, accuracy: -1 })?.accuracy).toBeUndefined();
    expect(selfPlace({ lat: 1, lng: 2, accuracy: 250000 })?.accuracy).toBe(100000);
    for (const accuracy of [null, -1, 250000, 12]) {
      expect(isGlobeSync({ ...message, places: [selfPlace({ lat: 1, lng: 2, accuracy })] })).toBe(true);
    }
    for (const position of [null, undefined, { lat: NaN, lng: 0 }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 }]) {
      expect(selfPlace(position)).toBeUndefined();
    }
  });

  it('decodes native JSON messages and browser message objects', () => {
    expect(parseGlobeEvent('{"type":"select","id":"paris"}')).toEqual({ type: 'select', id: 'paris' });
    expect(parseGlobeEvent({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseGlobeEvent({ type: 'landmark', id: 'louvre' })).toEqual({ type: 'landmark', id: 'louvre' });
    expect(parseGlobeEvent({ type: 'error', message: 'No WebGL' })).toEqual({ type: 'error', message: 'No WebGL' });
  });

  it('frames typical landmarks without letting an outlier or an empty list set the zoom', () => {
    const paris = message.places[0];
    const near = (index: number) => ({ _id: `near-${index}`, name: 'Near', lat: paris.lat + 0.009, lng: paris.lng });
    expect(landmarkRange(paris, [])).toBe(1800);
    expect(landmarkRange(paris, [{ ...paris, _id: 'centre' }])).toBe(1800);
    const typical = landmarkRange(paris, [0, 1, 2, 3].map(near));
    expect(typical).toBeGreaterThan(3000);
    expect(typical).toBeLessThan(4000);
    expect(landmarkRange(paris, [...[0, 1, 2, 3].map(near), { _id: 'versailles', name: 'Versailles', lat: 48.8049, lng: 2.1204 }])).toBe(typical);
    expect(landmarkRange(paris, [{ _id: 'far', name: 'Far', lat: paris.lat + 1, lng: paris.lng }])).toBe(15000);
  });

  it('ignores invalid or unknown messages, including layer switching', () => {
    for (const data of ['bad json', null, { type: 'select', id: 123 }, { type: 'setOptions', cartoon: false }]) {
      expect(parseGlobeEvent(data)).toBeNull();
      expect(isGlobeSync(data)).toBe(false);
    }
  });
});
