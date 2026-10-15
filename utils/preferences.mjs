export const DEFAULT_APPEARANCE = Object.freeze({
  theme: "dark",
  accent: "#b5f36d",
  columns: "auto",
  spacing: "comfortable",
});
export function validateAppearance(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !Object.hasOwn(DEFAULT_APPEARANCE, key)) ||
    !["dark", "light"].includes(value.theme) ||
    !/^#[a-f0-9]{6}$/i.test(value.accent || "") ||
    !["auto", "4", "5"].includes(value.columns) ||
    !["compact", "comfortable", "spacious"].includes(value.spacing)
  )
    throw new Error(
      "Choose a supported theme, six-digit accent color, grid size, and spacing.",
    );
  return {
    theme: value.theme,
    accent: value.accent.toLowerCase(),
    columns: value.columns,
    spacing: value.spacing,
  };
}
