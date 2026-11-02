/**
 * AniEmbed Service
 * Documentation & Generator: https://aniembed.se/?page=1#generator
 * Endpoint: https://aniembed.se/e/{ANILIST_ID}/{EPISODE}?lang={sub|dub}&autoplay={0|1}&t={SECONDS}
 */

export type AniEmbedOptions = {
  anilistId: number | string;
  episode: number | string;
  lang?: "sub" | "dub";
  autoplay?: boolean | 0 | 1;
  startTime?: number;
};

/**
 * Helper: buildEmbedUrl
 * Generates URLs in exactly the required formats using URLSearchParams:
 * - Basic: https://aniembed.se/e/{ANILIST_ID}/{EPISODE}
 * - Configured: https://aniembed.se/e/{ANILIST_ID}/{EPISODE}?lang={sub|dub}&autoplay={0|1}&t={SECONDS}
 */
export function buildEmbedUrl(
  anilistId: number | string,
  episode: number | string,
  lang: "sub" | "dub" = "sub",
  autoplay: 0 | 1 | boolean = 0,
  startSeconds: number = 0
): string {
  if (!anilistId || Number(anilistId) <= 0) {
    throw new Error("Invalid AniList ID");
  }
  if (!episode || Number(episode) <= 0) {
    throw new Error("Invalid episode number");
  }

  const params = new URLSearchParams();
  if (lang) {
    params.set("lang", lang);
  }
  const autoplayVal = typeof autoplay === "boolean" ? (autoplay ? 1 : 0) : (autoplay ?? 0);
  params.set("autoplay", String(autoplayVal));

  const tSec = Math.max(0, Math.floor(startSeconds || 0));
  if (tSec > 0) {
    params.set("t", String(tSec));
  } else {
    params.set("t", "0");
  }

  return `https://aniembed.se/e/${anilistId}/${episode}?${params.toString()}`;
}

export function getAniEmbedUrl(options: AniEmbedOptions): string {
  return buildEmbedUrl(
    options.anilistId,
    options.episode,
    options.lang || "sub",
    options.autoplay ? 1 : 0,
    options.startTime || 0
  );
}
