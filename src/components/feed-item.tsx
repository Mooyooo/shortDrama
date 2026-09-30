import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { Series } from '@/data/catalog';

type Props = {
  series: Series;
  height: number;
  // Only the visible item plays; neighbours stay mounted and paused so they buffer ahead.
  isActive: boolean;
  bottomInset: number;
};

export function FeedItem({ series, height, isActive, bottomInset }: Props) {
  const [pausedByUser, setPausedByUser] = useState(false);
  const [wasActive, setWasActive] = useState(isActive);
  const player = useVideoPlayer(series.trailerUrl, (p) => {
    p.loop = true;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  // Swiping away clears a tap-to-pause, so coming back always plays.
  if (wasActive !== isActive) {
    setWasActive(isActive);
    if (!isActive) setPausedByUser(false);
  }

  // Becoming visible starts the trailer from the beginning.
  useEffect(() => {
    if (isActive) {
      player.replay();
    } else {
      player.pause();
    }
  }, [isActive, player]);

  useEffect(() => {
    if (pausedByUser) {
      player.pause();
    } else if (isActive) {
      player.play();
    }
    // isActive changes are handled above; this effect only reacts to taps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pausedByUser, player]);

  return (
    <Pressable style={[styles.container, { height }]} onPress={() => setPausedByUser((v) => !v)}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />

      {status === 'loading' && <ActivityIndicator style={styles.center} color="#fff" size="large" />}
      {pausedByUser && <Text style={[styles.center, styles.playIcon]}>▶</Text>}

      <View style={[styles.overlay, { paddingBottom: bottomInset + Spacing.four }]}>
        <Text style={styles.title}>{series.title}</Text>
        <Text style={styles.tags}>{series.tags.join(' · ')}</Text>
        <Text style={styles.synopsis} numberOfLines={2}>
          {series.synopsis}
        </Text>
        <Text style={styles.meta}>
          EP 1 / {series.episodeCount} · {series.freeEpisodes} free episodes
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#000',
  },
  center: {
    position: 'absolute',
    alignSelf: 'center',
    top: '45%',
  },
  playIcon: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 64,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingTop: Spacing.three,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  tags: {
    color: '#FFC857',
    fontSize: 13,
    fontWeight: '600',
  },
  synopsis: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
  },
  meta: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
});
