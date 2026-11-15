import { Redirect } from 'expo-router';

import { DevSession } from '@/components/dev-session';

export default function DevScreen() {
  return __DEV__ ? <DevSession /> : <Redirect href="/" />;
}
