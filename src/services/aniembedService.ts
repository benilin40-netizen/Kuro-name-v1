/**
 * AniEmbed Service
 * Documentation & Generator: https://aniembed.se/?page=1#generator
 * Endpoint: https://aniembed.se/e/{ANILIST_ID}/{EPISODE}?lang={sub|dub}&autoplay={0|1}&t={SECONDS}
 */

export type AniEmbedOptions = {
  anilistId: number;
  episode: number;
  lang: "sub" | "dub";
  autoplay: boolean;
  startTime?: number;
};

export function getAniEmbedUrl(options: AniEmbedOptions): string {
  const { anilistId, episode, lang, autoplay, startTime = 0 } = options;

  if (!Number.isInteger(anilistId) || anilistId <= 0) {
    throw new Error("Invalid AniList ID");
  }

  if (!Number.isInteger(episode) || episode <= 0) {
    throw new Error("Invalid episode number");
  }

  const params = new URLSearchParams({
    lang,
    autoplay: autoplay ? "1" : "0",
    t: String(Math.max(0, Math.floor(startTime)))
  });

  return `https://aniembed.se/e/${anilistId}/${episode}?${params.toString()}`;
}
