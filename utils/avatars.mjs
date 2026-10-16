const LEGACY_DICEBEAR_PREFIX =
  "https://api.dicebear.com/7.x/pixel-art/svg?seed=";

const DEFINITIONS = [
  ["celestial-guardian", "Celestial Guardian", "pixel_hero"],
  ["neon-oni", "Neon Oni", "pixel_cyber_bot"],
  ["ice-wolf", "Ice Wolf", "pixel_wizard"],
  ["arcane-owl", "Arcane Owl", "pixel_ninja"],
  ["lava-golem", "Lava Golem", "pixel_cute_cat"],
  ["mecha-dragon", "Mecha Dragon", "pixel_astronaut"],
  ["spectral-fox", "Spectral Fox", "pixel_pirate"],
  ["abyssal-leviathan", "Abyssal Leviathan", "pixel_forest_elf"],
  ["solar-lion", "Solar Lion", "pixel_dragon"],
  ["moon-moth", "Moon Moth", "pixel_skater"],
  ["armored-raven", "Armored Raven", "pixel_fox"],
  ["cosmic-jellyfish", "Cosmic Jellyfish", "pixel_knight"],
  ["cyber-cobra", "Cyber Cobra", "pixel_mermaid"],
  ["forest-titan", "Forest Titan", "pixel_robot"],
  ["storm-phoenix", "Storm Phoenix", "pixel_panda"],
  ["void-duelist", "Void Duelist", "pixel_cowgirl"],
  ["mushroom-alchemist", "Mushroom Alchemist", "pixel_cowboy"],
  ["clockwork-beetle", "Clockwork Beetle", "pixel_fairy"],
  ["haunted-knight", "Haunted Knight", "pixel_racer"],
  ["aurora-stag", "Aurora Stag", "pixel_gamer"],
  ["plasma-sentinel", "Plasma Sentinel", "pixel_samurai"],
  ["shadow-panther", "Shadow Panther", "pixel_space_princess"],
  ["coral-siren", "Coral Siren", "pixel_biker"],
  ["thunder-ram", "Thunder Ram", "pixel_owl"],
  ["mimic-vault", "Mimic Vault", "pixel_dreamer"],
  ["emerald-mantis", "Emerald Mantis", "pixel_punk"],
  ["comet-shark", "Comet Shark", "pixel_mage"],
  ["porcelain-spirit", "Porcelain Spirit", "pixel_explorer"],
  ["cactus-ranger", "Cactus Ranger", "pixel_rainbow"],
  ["prismatic-eye", "Prismatic Eye", "pixel_moon"],
];

export const AVATARS = DEFINITIONS.map(([id, name]) => ({
  id,
  seed: id,
  name,
  url: `/avatars/${id}.webp`,
}));

export const LEGACY_AVATAR_REPLACEMENTS = DEFINITIONS.map(
  ([id, , legacySeed]) => ({
    from: `${LEGACY_DICEBEAR_PREFIX}${legacySeed}`,
    to: `/avatars/${id}.webp`,
  }),
);

const LEGACY_AVATAR_LOOKUP = new Map(
  LEGACY_AVATAR_REPLACEMENTS.map(({ from, to }) => [from, to]),
);

export const normalizeAvatarUrl = (value) =>
  LEGACY_AVATAR_LOOKUP.get(value) || value;

export const DEFAULT_AVATAR = AVATARS[0].url;
export const isAvatarUrl = (value) =>
  AVATARS.some((avatar) => avatar.url === value);

// Every motion transforms the whole artwork, so all 30 portraits share one rig.
export const AVATAR_MOTIONS = ["tilt", "look", "nod", "rise"];
