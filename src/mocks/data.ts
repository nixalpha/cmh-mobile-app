import type { ArtName } from '@/art';

export type Scene = { sky: string; ground: string; mark: string };

export type Post = Scene & {
  by?: string;
  who: string;
  verb: string;
  place: string;
  meta: string;
  badge: string;
};

export const me = {
  handle: '@samrivera',
  name: 'Sam Rivera',
  initials: 'SR',
  color: '#F6CDBA',
  bio: 'Slow traveler · trains over planes',
  privacy: 'Home city hidden · friends only',
  stats: [
    { value: '14', label: 'Cities' },
    { value: '38', label: 'Landmarks' },
    { value: '6', label: 'Countries' },
  ],
  topCities: ['Tokyo', 'Lisbon', 'Paris'],
  friendCount: 52,
  rankings: 14,
};

export const friends = [
  { id: 'mc', first: 'Maya', name: 'Maya Chen', initials: 'MC', color: '#F6CDBA' },
  { id: 'tp', first: 'Theo', name: 'Theo Park', initials: 'TP', color: '#CFE0F5' },
  { id: 'ar', first: 'Ana', name: 'Ana Ruiz', initials: 'AR', color: '#F6E7B4' },
  { id: 'jb', first: 'Jonah', name: 'Jonah Bell', initials: 'JB', color: '#D7EBD5' },
  { id: 'lk', first: 'Lea', name: 'Lea Kim', initials: 'LK', color: '#E6D8F3' },
  { id: 'oa', first: 'Omar', name: 'Omar Ali', initials: 'OA', color: '#F3D3DC' },
];

export const seedCities = [
  'Paris',
  'Tokyo',
  'Lisbon',
  'New York',
  'Rome',
  'Reykjavík',
  'Kyoto',
  'Barcelona',
  'Mexico City',
  'Istanbul',
  'Seoul',
  'Cape Town',
  'Bangkok',
  'Buenos Aires',
];

export const seedSelected = seedCities.slice(0, 6);

export const recommendations = {
  hero: {
    reason: 'Because you ranked Lisbon #2',
    name: 'Porto',
    meta: 'Portugal · 3 friends ranked it top 5',
    art: 'porto',
  },
  more: [
    { name: 'Cappadocia', meta: '12 friends want to go', art: 'cappadocia' },
    { name: 'Hallstatt', meta: 'Pairs with Reykjavík', art: 'hallstatt' },
  ],
} satisfies {
  hero: { reason: string; name: string; meta: string; art: ArtName };
  more: { name: string; meta: string; art: ArtName }[];
};

export const friendsFeed = {
  ranking: {
    friend: friends[0],
    place: 'Kyoto',
    meta: '2h · #2 of 21 cities · Friends only',
    score: '9.4',
    winner: { name: 'Kyoto', art: 'kyotoCard' },
    loser: { name: 'Paris', art: 'parisCard' },
    note: 'Took four tries to decide. The moss gardens at Gio-ji won it.',
    likes: 48,
    comments: 6,
  },
  unlock: {
    friend: friends[1],
    place: 'Hallgrímskirkja',
    meta: '5h · Reykjavík · 4 of 7 landmarks',
    art: 'hallgrimskirkja',
  },
} satisfies {
  ranking: Record<string, unknown> & { winner: { name: string; art: ArtName }; loser: { name: string; art: ArtName } };
  unlock: Record<string, unknown> & { art: ArtName };
};

export const myPosts: Post[] = [
  { who: 'You', verb: 'ranked', place: 'Lisbon', meta: 'Beat Paris · Jul 2025 · Friends only', badge: '#2', sky: '#F8E3C2', ground: '#C99D62', mark: '#E0A93A' },
  { who: 'You', verb: 'unlocked', place: 'Louvre Pyramid', meta: 'Paris · photo-verified', badge: '5', sky: '#C7D9EA', ground: '#EDE6D6', mark: '#6FB6D3' },
  { who: 'You', verb: 'ranked', place: 'Reykjavík', meta: 'Beat Rome · Feb 2026 · Friends only', badge: '#4', sky: '#D8E4EE', ground: '#AFC0CF', mark: '#F4F6F8' },
];

export const friendPosts: Post[] = [
  { by: 'mc', who: 'Maya', verb: 'ranked', place: 'Kyoto', meta: 'Beat Paris · 2h', badge: '#2', sky: '#F4C4B0', ground: '#B7848A', mark: '#3E2F35' },
  { by: 'tp', who: 'Theo', verb: 'unlocked', place: 'Hallgrímskirkja', meta: 'Reykjavík · 5h', badge: '4/7', sky: '#C9DBEA', ground: '#E8EEF3', mark: '#9AA7B4' },
  { by: 'ar', who: 'Ana', verb: 'ranked', place: 'Mexico City', meta: 'Beat Barcelona · 1d', badge: '#1', sky: '#F6DDB0', ground: '#C98F5E', mark: '#7A4A3A' },
  { by: 'jb', who: 'Jonah', verb: 'saved', place: 'Porto', meta: 'Want to go · 2d', badge: '+', sky: '#F3C9A6', ground: '#6F9CB8', mark: '#F7EBDD' },
  { by: 'mc', who: 'Maya', verb: 'unlocked', place: 'Fushimi Inari', meta: 'Kyoto · 3d', badge: '3/8', sky: '#F4C4B0', ground: '#C55D44', mark: '#D9533F' },
];

export const cityFilters = ['All', '2026', '2025', 'Earlier'];

export const cities = [
  { id: 'paris', name: 'Paris', meta: 'France · Jun 2024', verified: 4, selfReported: 1, art: 'tileParis' },
  { id: 'tokyo', name: 'Tokyo', meta: 'Japan · Mar 2025', verified: 7, selfReported: 0, art: 'tileTokyo' },
  { id: 'rome', name: 'Rome', meta: 'Italy · Sep 2023', verified: 2, selfReported: 2, art: 'tileRome' },
  { id: 'new-york', name: 'New York', meta: 'USA · Dec 2022', verified: 3, selfReported: 3, art: 'tileNewYork' },
  { id: 'reykjavik', name: 'Reykjavík', meta: 'Iceland · Feb 2026', verified: 3, selfReported: 0, art: 'tileReykjavik' },
  { id: 'lisbon', name: 'Lisbon', meta: 'Portugal · Jul 2025', verified: 6, selfReported: 0, art: 'tileLisbon' },
] satisfies { id: string; name: string; meta: string; verified: number; selfReported: number; art: ArtName }[];

export const citySummary = '14 cities · 6 countries · 38 landmarks';

export const paris = {
  name: 'Paris',
  meta: 'France · visited Jun 2024',
  collected: 5,
  labels: [
    { name: 'Eiffel Tower', left: 46, top: 66, verified: true },
    { name: 'Arc de Triomphe · add a photo', left: 24, top: 124, verified: false },
    { name: 'Louvre', left: 240, top: 136, verified: true },
    { name: 'Notre-Dame', left: 252, top: 252, verified: true },
  ],
  next: [
    { name: 'Sacré-Cœur', meta: '8 friends unlocked', art: 'lockSacreCoeur' },
    { name: 'Musée d’Orsay', meta: '5 friends unlocked', art: 'lockOrsay' },
    { name: 'Panthéon', meta: '3 friends unlocked', art: 'lockPantheon' },
    { name: 'Moulin Rouge', meta: '2 friends unlocked', art: 'lockMoulinRouge' },
  ],
  nudge: 'Back in Paris? We’ll nudge you when you’re within 300 m of one of these.',
} satisfies Record<string, unknown> & { next: { name: string; meta: string; art: ArtName }[] };

export const globePins = [
  { name: 'Kyoto', art: 'pinKyoto', left: 70, top: 52 },
  { name: 'Cappadocia', art: 'pinCappadocia', left: 228, top: 36 },
  { name: 'Santorini', art: 'pinSantorini', left: 236, top: 190 },
  { name: 'Machu Picchu', art: 'pinMachuPicchu', left: 52, top: 208 },
  { name: 'Banff', art: 'pinBanff', left: 150, top: 126 },
] satisfies { name: string; art: ArtName; left: number; top: number }[];

export const inView = {
  name: 'Kyoto, Japan',
  meta: '18 friends have been · avg 9.1',
};

export const mapFilters = ['Friends’ picks', 'Not visited', 'Landmarks', 'Weekend trips'];

export const mapPins = [
  { label: 'Lisbon · you', score: '9.6', left: 46, top: 446, mine: true },
  { label: 'Porto', score: '9.2', left: 62, top: 236 },
  { label: 'Madrid', score: '8.4', left: 178, top: 330 },
  { label: 'Seville', score: '8.9', left: 124, top: 500 },
  { label: 'Barcelona', score: '9.0', left: 266, top: 196 },
  { label: 'Valencia', score: '+4', left: 238, top: 470, cluster: true },
];

export const mapRegion = {
  title: 'Iberia · ranked by friends',
  count: '6 places',
  places: [
    { name: 'Porto', meta: 'Maya, Theo + 1 ranked it top 5', score: '9.2', sky: '#F3C9A6', ground: '#6F9CB8', mark: '#F7EBDD' },
    { name: 'Seville', meta: 'Ana ranked it #3 · 2.5 h from Lisbon', score: '8.9', sky: '#F6DDB0', ground: '#D9A47E', mark: '#C98F5E' },
  ],
};

export const kyoto = {
  id: 'kyoto',
  name: 'Kyoto',
  region: 'JAPAN · KANSAI',
  score: '9.1',
  friendCount: 18,
  social: ' have been · Maya ranked it #2',
  visitors: [friends[0], friends[1], friends[2], friends[4]],
  landmarks: [
    { name: 'Fushimi Inari', art: 'lmFushimiInari', color: '#F6DCD6' },
    { name: 'Kinkaku-ji', art: 'lmKinkakuji', color: '#F8EBC8' },
    { name: 'Arashiyama', art: 'lmArashiyama', color: '#E2EED9' },
    { name: 'Kiyomizu-dera', art: 'lmKiyomizudera', color: '#EDE3D6' },
  ],
  landmarkProgress: '0 of 8',
  hint: 'Ranking asks when you visited. Add a geotagged photo to unlock landmarks from that trip.',
} satisfies Record<string, unknown> & { landmarks: { name: string; art: ArtName; color: string }[] };

export const rankLists = ['Cities', 'Landmarks', 'Trips'] as const;
export const months = ['October', 'September', 'August', 'July'];
export const years = ['2026', '2025', '2024', 'Earlier'];
