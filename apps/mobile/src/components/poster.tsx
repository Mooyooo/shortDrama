import { StyleSheet, Text, View } from 'react-native';

import type { Series } from '@/data/catalog';

// No artwork yet: a coloured card with the title's first letter stands in for each poster.
const COLORS = ['#FF3B5C', '#7B61FF', '#0FA3B1', '#F28C28', '#3A86FF', '#D63384'];

export function colorFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function Poster({ series, width }: { series: Series; width: number }) {
  // Posters are vertical 3:4, like the covers editors upload.
  const height = (width * 4) / 3;
  return (
    <View
      style={[
        styles.poster,
        { width, height, borderRadius: width / 10, backgroundColor: colorFor(series.id) },
      ]}>
      <Text style={[styles.letter, { fontSize: width / 2.5 }]}>
        {series.title.replace(/^The /, '').charAt(0)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: '#fff',
    fontWeight: '700',
  },
});
