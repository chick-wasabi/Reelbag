export function uid() {
  return crypto.randomUUID();
}
export function parseReelUrl(input) {
  try {
    const url = new URL(input.trim());
    if (
      !["https:", "http:"].includes(url.protocol) ||
      !["instagram.com", "www.instagram.com", "m.instagram.com"].includes(
        url.hostname,
      ) ||
      url.username ||
      url.password
    )
      return null;
    const match = url.pathname.match(/^\/(reels?|p)\/([A-Za-z0-9_-]{1,100})\/?$/);
    return match
      ? {
          type: match[1] === "p" ? "post" : "reel",
          shortcode: match[2],
          url: `https://www.instagram.com/${match[1] === "p" ? "p" : "reel"}/${match[2]}/`,
        }
      : null;
  } catch {
    return null;
  }
}
