import { DEFAULT_AVATAR_FRAME, isAvatarFrame } from "./avatars.mjs";

export const DEFAULT_APPEARANCE = Object.freeze({
  theme: "dark",
  accent: "#b5f36d",
  columns: "auto",
  spacing: "comfortable",
  avatarFrame: DEFAULT_AVATAR_FRAME,
  design: "basic",
});
export function validateAppearance(value) {
  const normalized = { ...DEFAULT_APPEARANCE, ...value };
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !Object.hasOwn(DEFAULT_APPEARANCE, key)) ||
    !["theme", "accent", "columns", "spacing"].every((key) =>
      Object.hasOwn(value, key),
    ) ||
    !["dark", "light"].includes(normalized.theme) ||
    !/^#[a-f0-9]{6}$/i.test(normalized.accent || "") ||
    !["auto", "4", "5"].includes(normalized.columns) ||
    !["compact", "comfortable", "spacious"].includes(normalized.spacing) ||
    !["basic", "neo-brutalism", "game-inventory"].includes(normalized.design) ||
    !isAvatarFrame(normalized.avatarFrame)
  )
    throw new Error(
      "Choose a supported theme, six-digit accent color, grid size, and spacing.",
    );
  return {
    theme: normalized.theme,
    accent: normalized.accent.toLowerCase(),
    columns: normalized.columns,
    spacing: normalized.spacing,
    avatarFrame: normalized.avatarFrame,
    design: normalized.design,
  };
}
