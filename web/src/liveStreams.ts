const TABLE_LIVE_URLS: Record<string, string> = {
  T1: "https://www.youtube.com/watch?v=l1uYkeJ-yZ8",
  T2: "https://www.youtube.com/watch?v=QECjLybE-Ao",
  T3: "https://www.youtube.com/watch?v=cH99q5tpusA",
  T4: "https://www.youtube.com/watch?v=XiEq45TlcOI",
  T5: "https://www.youtube.com/watch?v=JIZh86zOXRQ",
  T6: "https://www.youtube.com/watch?v=F4Pa8A7kEQE",
  T7: "https://www.youtube.com/watch?v=4DKOInRrBKk",
  T8: "https://www.youtube.com/watch?v=QH2nSBC3Fwc"
};

export function getTableLiveUrl(tableNumber: string): string | null {
  const number = tableNumber.match(/\d+/)?.[0];
  if (!number) return null;
  return TABLE_LIVE_URLS[`T${Number(number)}`] || null;
}

export function getYouTubeEmbedUrl(videoUrl: string): string | null {
  try {
    const url = new URL(videoUrl);
    const host = url.hostname.toLocaleLowerCase();
    let videoId: string | null = null;

    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] || null;
    } else if (
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtube-nocookie.com" ||
      host === "www.youtube-nocookie.com"
    ) {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v");
      } else {
        const pathMatch = url.pathname.match(/^\/(?:embed|live|shorts)\/([^/]+)/);
        videoId = pathMatch?.[1] || null;
      }
    }

    if (!videoId || !/^[\w-]{11}$/.test(videoId)) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=0&rel=0`;
  } catch {
    return null;
  }
}
