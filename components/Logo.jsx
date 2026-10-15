import {
  LOGO_DARK,
  LOGO_BOOKMARK,
  LOGO_PLAY,
  LOGO_FRAME,
} from "../utils/logo.mjs";
export default function Logo() {
  return (
    <svg
      className="brand-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width="64"
      height="64"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        className="logo-frame"
        {...LOGO_FRAME}
        fill={LOGO_DARK}
        stroke="currentColor"
        strokeWidth="2"
      />
      <path className="logo-bookmark" d={LOGO_BOOKMARK} fill="currentColor" />
      <path className="logo-play" d={LOGO_PLAY} fill={LOGO_DARK} />
    </svg>
  );
}
