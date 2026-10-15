export const LOGO_DARK = "#101214";
export const LOGO_BOOKMARK = "M20 17h24v33L32 42l-12 8V17Z";
export const LOGO_PLAY = "m28 24 11 6-11 6Z";
export const LOGO_FRAME = { x: 1, y: 1, width: 62, height: 62, rx: 17 };

// Shared geometry for inline branding, the tab favicon, and raster icon assets.
export function createLogoSvg(accent = "#b5f36d") {
  const color = /^#[a-f0-9]{6}$/i.test(accent) ? accent : "#b5f36d";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="1" y="1" width="62" height="62" rx="17" fill="${LOGO_DARK}" stroke="${color}" stroke-width="2"/><path d="${LOGO_BOOKMARK}" fill="${color}"/><path d="${LOGO_PLAY}" fill="${LOGO_DARK}"/></svg>`;
}
