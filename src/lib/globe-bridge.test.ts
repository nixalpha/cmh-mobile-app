import { describe, expect, it } from 'vitest';

import { isGlobeSync, parseGlobeEvent, type GlobeSync } from './globe-bridge';

const message: GlobeSync = {
  type: 'sync', active: true, focusRevision: 1, selectedId: 'paris',
  places: [{ _id: 'paris', name: 'Paris', lat: 48.8566, lng: 2.3522 }],
};

describe('cartoon globe bridge', () => {
  it('accepts destination updates with valid geographic coordinates', () => {
    expect(isGlobeSync(message)).toBe(true);
    expect(isGlobeSync({ ...message, selectedId: undefined, places: [] })).toBe(true);
    expect(isGlobeSync({ ...message, zoomOutRevision: 1 })).toBe(true);
  });

  it('rejects malformed data, invalid coordinates and unbounded markers', () => {
    for (const data of [null, {}, { ...message, active: 'yes' }, { ...message, places: [null] },
      { ...message, zoomOutRevision: -1 }, { ...message, zoomOutRevision: NaN },
      { ...message, zoomOutRevision: 1.5 }, { ...message, zoomOutRevision: '1' },
      { ...message, places: [{ ...message.places[0], lat: NaN }] },
      { ...message, places: [{ ...message.places[0], lng: 181 }] },
      { ...message, places: Array(1025).fill(message.places[0]) }]) expect(isGlobeSync(data)).toBe(false);
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

  it('decodes native JSON messages and browser message objects', () => {
    expect(parseGlobeEvent('{"type":"select","id":"paris"}')).toEqual({ type: 'select', id: 'paris' });
    expect(parseGlobeEvent({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseGlobeEvent({ type: 'error', message: 'No WebGL' })).toEqual({ type: 'error', message: 'No WebGL' });
  });

  it('ignores invalid or unknown messages, including layer switching', () => {
    for (const data of ['bad json', null, { type: 'select', id: 123 }, { type: 'setOptions', cartoon: false }]) {
      expect(parseGlobeEvent(data)).toBeNull();
      expect(isGlobeSync(data)).toBe(false);
    }
  });
});
