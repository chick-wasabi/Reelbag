export const FOLDER_ICONS = [
  "folder", "bike", "gamepad", "camera", "music", "heart", "flame", "sparkles",
  "zap", "rocket", "paw", "chef", "dumbbell", "plane", "car", "clapperboard",
  "palette", "book", "crown", "ghost", "laugh", "mountain", "party", "star",
];

export function normalizeFolderIcon(value) {
  return FOLDER_ICONS.includes(value) ? value : "folder";
}
