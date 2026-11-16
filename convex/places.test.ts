import { expect, test } from 'vitest';

import { api } from './_generated/api';
import { setup, signUp, type Test } from './test.setup';

const paris = { lat: 48.8566, lng: 2.3522 };

async function seedParis(t: Test) {
  return t.run(ctx => ctx.db.insert('destinations', { wikidataId: 'test-paris', kind: 'city', name: 'Paris', searchText: 'paris',
    countryCode: 'FR', countryName: 'France', ...paris, popularity: 1, tier: 1, landmarkCount: 0, status: 'active', importedAt: 1 }));
}

test('cityAt matches a photo location to a catalog city and reports visits', async () => {
  const t = setup();
  const alice = await signUp(t, 'alice');
  const parisId = await seedParis(t);
  const near = { lat: paris.lat + 0.05, lng: paris.lng, city: 'Paris', countryCode: 'FR' };

  expect(await alice.as.query(api.places.cityAt, near)).toMatchObject({ destination: { _id: parisId }, visited: false });
  expect(await alice.as.query(api.places.cityAt, { lat: 0.5, lng: 0.5 })).toBeNull();

  await alice.as.mutation(api.places.addVisit, { destinationId: parisId });
  await alice.as.mutation(api.places.addVisit, { destinationId: parisId });
  expect(await alice.as.query(api.places.cityAt, near)).toMatchObject({ visited: true });
  expect(await alice.as.query(api.users.me, {})).toMatchObject({ stats: { cities: 1 } });

  await expect(t.query(api.places.cityAt, near)).rejects.toThrow(/UNAUTHENTICATED/);
  await expect(alice.as.query(api.places.cityAt, { lat: 91, lng: 0 })).rejects.toThrow(/INVALID/);
});
