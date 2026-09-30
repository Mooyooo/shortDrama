import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colorFor, Poster } from '@/components/poster';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { SAMPLE_SERIES, type Series } from '@/data/catalog';

const POSTER_WIDTH = 108;
const ALL = 'All';

// Sample orderings until the API's Discover collections (Trending, New, Top) are wired in.
const ROWS: { title: string; series: Series[] }[] = [
  { title: 'Trending', series: SAMPLE_SERIES },
  { title: 'New', series: [...SAMPLE_SERIES].reverse() },
  { title: 'Top', series: [...SAMPLE_SERIES].sort((a, b) => b.episodeCount - a.episodeCount) },
];
const GENRES = [ALL, ...new Set(SAMPLE_SERIES.flatMap((s) => s.tags))];

const openSeries = (series: Series) =>
  router.push({ pathname: '/series/[id]', params: { id: series.id } });

export default function DiscoverScreen() {
  const [genre, setGenre] = useState(ALL);
  const matches = (s: Series) => genre === ALL || s.tags.includes(genre);
  const rows = ROWS.map((row) => ({ ...row, series: row.series.filter(matches) })).filter(
    (row) => row.series.length > 0,
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle" style={styles.inset}>
            Discover
          </ThemedText>
          <Banners series={SAMPLE_SERIES.slice(0, 3)} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            {GENRES.map((name) => (
              <Pressable key={name} onPress={() => setGenre(name)}>
                <ThemedView
                  type={genre === name ? 'backgroundSelected' : 'backgroundElement'}
                  style={styles.chip}>
                  <ThemedText
                    type={genre === name ? 'smallBold' : 'small'}
                    themeColor={genre === name ? 'text' : 'textSecondary'}>
                    {name}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            ))}
          </ScrollView>
          {rows.map((row) => (
            <PosterRow key={row.title} title={row.title} series={row.series} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Banners({ series }: { series: Series[] }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - Spacing.three * 2;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Snap one card at a time; cards are narrower than the screen, so not pagingEnabled.
      snapToInterval={cardWidth + Spacing.two}
      decelerationRate="fast"
      contentContainerStyle={styles.banners}>
      {series.map((s) => (
        <Pressable key={s.id} onPress={() => openSeries(s)}>
          <View style={[styles.banner, { width: cardWidth, backgroundColor: colorFor(s.id) }]}>
            <Text style={styles.bannerTags}>{s.tags.join(' · ')}</Text>
            <Text style={styles.bannerTitle}>{s.title}</Text>
            <Text style={styles.bannerSynopsis} numberOfLines={2}>
              {s.synopsis}
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function PosterRow({ title, series }: { title: string; series: Series[] }) {
  return (
    <View style={styles.row}>
      <ThemedText type="smallBold" style={styles.inset}>
        {title}
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowItems}>
        {series.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => openSeries(s)}
            style={({ pressed }) => [styles.rowItem, pressed && styles.pressed]}>
            <Poster series={s} width={POSTER_WIDTH} />
            <ThemedText type="small" numberOfLines={2}>
              {s.title}
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.four,
  },
  inset: {
    paddingHorizontal: Spacing.three,
  },
  banners: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  banner: {
    height: 180,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    justifyContent: 'flex-end',
    gap: Spacing.one,
  },
  bannerTags: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  bannerSynopsis: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
  },
  chips: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
    minHeight: 36,
    justifyContent: 'center',
  },
  row: {
    gap: Spacing.two,
  },
  rowItems: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  rowItem: {
    width: POSTER_WIDTH,
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
