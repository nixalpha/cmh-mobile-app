import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';
import { space } from '@/constants/theme';

export function BrandHeader({ actions }: { actions?: ReactNode }) {
  return (
    <View style={styles.header}>
      <BrandLogo height={28} />
      {actions && <View style={styles.actions}>{actions}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
});
