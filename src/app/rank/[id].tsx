import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionCard } from '@/components/action-card';
import { Button } from '@/components/ui/button';
import { Glass } from '@/components/ui/glass';
import { IconButton } from '@/components/ui/icon-button';
import { PageDots } from '@/components/ui/page-dots';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Text } from '@/components/ui/text';
import { radius } from '@/constants/theme';
import { kyoto, months, rankLists, years } from '@/mocks/data';

const lists = rankLists.map((label) => ({ value: label, label }));

export default function RankScreen() {
  const [list, setList] = useState<(typeof rankLists)[number]>('Cities');
  const [month, setMonth] = useState(months[0]);
  const [year, setYear] = useState(years[0]);

  return (
    <Screen backdrop="rank" style={styles.content}>
      <View style={styles.header}>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
        <View style={styles.title}>
          <Text weight="extrabold" style={styles.titleText}>
            Rank {kyoto.name}
          </Text>
          <Text variant="caption" color="muted">
            {list} list · first, when you went
          </Text>
        </View>
        <PageDots count={4} active={0} gap={4} />
      </View>

      <Text variant="title2" style={styles.question} accessibilityRole="header">
        When were you in {kyoto.name}?
      </Text>
      <Text variant="bodySmall" color="inkSoft">
        Only places you’ve visited can be ranked. Cities, landmarks and trips each keep their own list.
      </Text>

      <SegmentedControl segments={lists} value={list} onChange={setList} />

      <Glass radius={radius.panel} style={styles.form}>
        <View style={styles.fields}>
          <Select label="Month" options={months} value={month} onChange={setMonth} />
          <Select label="Year" options={years} value={year} onChange={setYear} />
        </View>
        <ActionCard
          dashed
          radius={20}
          icon="photo"
          title="Add photos from this trip"
          subtitle={`Optional · geotags unlock ${kyoto.name}’s landmarks`}
          style={styles.photos}
        />
      </Glass>

      <Button label="Start comparing" style={styles.start} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, gap: 1 },
  titleText: { fontSize: 17, lineHeight: 22 },
  question: { marginTop: 4 },
  form: { padding: 18, gap: 14 },
  fields: { flexDirection: 'row', gap: 10 },
  photos: { padding: 14, gap: 12 },
  start: { marginTop: 'auto' },
});
