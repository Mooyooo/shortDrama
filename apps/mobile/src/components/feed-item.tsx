import { useEvent } from 'expo';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionRail } from '@/components/action-rail';
import { CommentsSheet } from '@/components/comments-sheet';
import { Poster } from '@/components/poster';
import { Spacing } from '@/constants/theme';
import type { Series } from '@/data/catalog';
import { useSeries } from '@/data/hooks';

type Props = {
  series: Series;
  height: number;
  // Only the visible item plays; neighbours stay mounted and paused so they buffer ahead.
  isActive: boolean;
  bottomInset: number;
};

export function FeedItem({ series, height, isActive, bottomInset }: Props) {
  const [pausedByUser, setPausedByUser] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [wasActive, setWasActive] = useState(isActive);
  // Episode 1's comments need its id, so the series loads only once comments open.
  const detail = useSeries(series.id, commentsOpen);
  const player = useVideoPlayer(series.trailerUrl, (p) => {
    p.loop = true;
  });
  const { status } = useEvent(player, 'statusChange', {
    status: player.status,
  });

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
      {series.trailerUrl ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        // No trailer uploaded yet: show the poster instead of a black screen.
        <View style={styles.noTrailer}>
          <Poster series={series} width={200} />
        </View>
      )}

      {status === 'loading' && (
        <ActivityIndicator style={styles.center} color="#fff" size="large" />
      )}
      {pausedByUser && <Text style={[styles.center, styles.playIcon]}>▶</Text>}

      <View style={[styles.overlay, { paddingBottom: bottomInset + Spacing.four }]}>
        <View style={styles.info}>
          <Text style={styles.title}>{series.title}</Text>
          <Text style={styles.tags}>{series.tags.join(' · ')}</Text>
          <Text style={styles.synopsis} numberOfLines={2}>
            {series.synopsis}
          </Text>
          <Text style={styles.meta}>
            EP 1 / {series.episodeCount} · {series.freeEpisodes} free episodes
          </Text>
          <Pressable
            style={({ pressed }) => [styles.watchButton, pressed && styles.pressed]}
            onPress={() => router.push({ pathname: '/series/[id]', params: { id: series.id } })}>
            <Text style={styles.watchLabel}>Watch full series ›</Text>
          </Pressable>
        </View>
        <ActionRail
          seriesId={series.id}
          seriesTitle={series.title}
          episode={1}
          onComments={() => setCommentsOpen(true)}
        />
      </View>
      <CommentsSheet
        visible={commentsOpen}
        episode={detail.data?.episodes[0] ?? null}
        episodeNumber={1}
        onClose={() => setCommentsOpen(false)}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#000',
  },
  noTrailer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 160,
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
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: Spacing.three,
    gap: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingTop: Spacing.three,
  },
  info: {
    flex: 1,
    gap: Spacing.one,
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
  watchButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
    backgroundColor: '#FF3B5C',
  },
  pressed: {
    opacity: 0.7,
  },
  watchLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
