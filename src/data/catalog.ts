// Placeholder catalog until the backend exists (Phase 2).
// Videos are public HLS test streams; they are landscape, so the feed crops them to fill.

export type Series = {
  id: string;
  title: string;
  synopsis: string;
  tags: string[];
  episodeCount: number;
  freeEpisodes: number;
  // Sample price per locked episode; real prices come from the backend.
  coinPrice: number;
  trailerUrl: string;
};

export const SAMPLE_SERIES: Series[] = [
  {
    id: 'billionaire-return',
    title: "The Billionaire's Return",
    synopsis: 'Cast out on her wedding day, she comes back five years later owning the company.',
    tags: ['Revenge', 'Billionaire'],
    episodeCount: 80,
    freeEpisodes: 8,
    coinPrice: 30,
    trailerUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  },
  {
    id: 'alpha-mate',
    title: "The Alpha's Rejected Mate",
    synopsis: 'Rejected by the pack leader, she discovers the bloodline that makes her his equal.',
    tags: ['Werewolf', 'Romance'],
    episodeCount: 95,
    freeEpisodes: 10,
    coinPrice: 30,
    trailerUrl: 'https://test-streams.mux.dev/tos_ismc/main.m3u8',
  },
  {
    id: 'hidden-heiress',
    title: 'The Hidden Heiress',
    synopsis: 'The quiet intern everyone mocks is the heir to the family they work for.',
    tags: ['Secret identity', 'Family'],
    episodeCount: 72,
    freeEpisodes: 6,
    coinPrice: 30,
    trailerUrl:
      'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
  },
  {
    id: 'second-chance',
    title: 'Second Chance Marriage',
    synopsis: 'Divorced for a lie, they are forced to share one house for thirty days.',
    tags: ['Romance', 'Family'],
    episodeCount: 64,
    freeEpisodes: 5,
    coinPrice: 30,
    trailerUrl:
      'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
  },
  {
    id: 'ceo-bodyguard',
    title: "The CEO's Secret Bodyguard",
    synopsis: 'Her new driver is the soldier who vanished the night her father died.',
    tags: ['Action', 'Romance'],
    episodeCount: 88,
    freeEpisodes: 8,
    coinPrice: 30,
    trailerUrl:
      'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8',
  },
];

export type Episode = {
  number: number;
  // Display only: the backend decides what a user may actually watch.
  free: boolean;
  videoUrl: string;
};

export function getSeries(id: string): Series | undefined {
  return SAMPLE_SERIES.find((s) => s.id === id);
}

// No per-episode videos yet, so every episode reuses the trailer stream.
export function getEpisodes(series: Series): Episode[] {
  return Array.from({ length: series.episodeCount }, (_, i) => ({
    number: i + 1,
    free: i < series.freeEpisodes,
    videoUrl: series.trailerUrl,
  }));
}
