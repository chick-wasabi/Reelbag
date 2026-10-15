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
    const match = url.pathname.match(/^\/reels?\/([A-Za-z0-9_-]{1,100})\/?$/);
    return match
      ? {
          shortcode: match[1],
          url: `https://www.instagram.com/reel/${match[1]}/`,
        }
      : null;
  } catch {
    return null;
  }
}
