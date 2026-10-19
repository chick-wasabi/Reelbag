const LEGACY_DICEBEAR_PREFIX =
  "https://api.dicebear.com/7.x/pixel-art/svg?seed=";

const DEFINITIONS = [
  ["night-owl", "Night Owl", "pixel_hero", "celestial-guardian"],
  ["sun-fox", "Sun Fox", "pixel_cyber_bot", "neon-oni"],
  ["moon-wolf", "Moon Wolf", "pixel_wizard", "ice-wolf"],
  ["forest-cat", "Forest Cat", "pixel_ninja", "arcane-owl"],
  ["ember-red-panda", "Ember Red Panda", "pixel_cute_cat", "lava-golem"],
  ["violet-stargazer", "Violet Stargazer", "pixel_astronaut", "mecha-dragon"],
  ["silver-drifter", "Silver Drifter", "pixel_pirate", "spectral-fox"],
  ["neon-night-runner", "Neon Night Runner", "pixel_forest_elf", "abyssal-leviathan"],
  ["sunset-explorer", "Sunset Explorer", "pixel_dragon", "solar-lion"],
  ["hooded-dreamer", "Hooded Dreamer", "pixel_skater", "moon-moth"],
  ["cloud-drake", "Cloud Drake", "pixel_fox", "armored-raven"],
  ["ember-phoenix", "Ember Phoenix", "pixel_knight", "cosmic-jellyfish"],
  ["mushroom-sprite", "Mushroom Sprite", "pixel_mermaid", "cyber-cobra"],
  ["snow-leopard", "Snow Leopard", "pixel_robot", "forest-titan"],
  ["cosmic-axolotl", "Cosmic Axolotl", "pixel_panda", "storm-phoenix"],
  ["raven-rogue", "Raven Rogue", "pixel_cowgirl", "void-duelist"],
  ["golden-lion", "Golden Lion", "pixel_cowboy", "mushroom-alchemist"],
  ["tide-serpent", "Tide Serpent", "pixel_fairy", "clockwork-beetle"],
  ["lavender-moth", "Lavender Moth", "pixel_racer", "haunted-knight"],
  ["moss-golem", "Moss Golem", "pixel_gamer", "aurora-stag"],
  ["sunny-capybara", "Sunny Capybara", "pixel_samurai", "plasma-sentinel"],
  ["teal-hyena", "Teal Hyena", "pixel_space_princess", "shadow-panther"],
  ["cozy-raccoon", "Cozy Raccoon", "pixel_biker", "coral-siren"],
  ["galaxy-panther", "Galaxy Panther", "pixel_owl", "thunder-ram"],
  ["storm-ram", "Storm Ram", "pixel_dreamer", "mimic-vault"],
  ["rose-celestial", "Rose Celestial", "pixel_punk", "emerald-mantis"],
  ["crimson-wanderer", "Crimson Wanderer", "pixel_mage", "comet-shark"],
  ["meadow-mage", "Meadow Mage", "pixel_explorer", "porcelain-spirit"],
  ["spirit-rider", "Spirit Rider", "pixel_rainbow", "cactus-ranger"],
  ["prism-feather", "Prism Feather", "pixel_moon", "prismatic-eye"],
];

export const AVATARS = DEFINITIONS.map(([id, name]) => ({
  id,
  seed: id,
  name,
  url: `/avatars/${id}.webp`,
}));

export const LEGACY_AVATAR_REPLACEMENTS = DEFINITIONS.flatMap(
  ([id, , legacySeed, previousId]) => [
    {
      from: `${LEGACY_DICEBEAR_PREFIX}${legacySeed}`,
      to: `/avatars/${id}.webp`,
    },
    {
      from: `/avatars/${previousId}.webp`,
      to: `/avatars/${id}.webp`,
    },
  ],
);

const LEGACY_AVATAR_LOOKUP = new Map(
  LEGACY_AVATAR_REPLACEMENTS.map(({ from, to }) => [from, to]),
);

export const normalizeAvatarUrl = (value) =>
  LEGACY_AVATAR_LOOKUP.get(value) || value;

export const DEFAULT_AVATAR = AVATARS[0].url;
export const isAvatarUrl = (value) =>
  AVATARS.some((avatar) => avatar.url === value);

export const AVATAR_FRAMES = [
  { id: "accent", name: "Bronze", description: "Forged bronze starter frame" },
  { id: "radiant", name: "Silver", description: "Polished silver tier" },
  { id: "sovereign", name: "Gold", description: "Ornate gold prestige" },
  { id: "arcane", name: "Emerald", description: "Animated accent energy" },
  { id: "obsidian", name: "Mythic", description: "Animated prismatic crown" },
];
export const DEFAULT_AVATAR_FRAME = AVATAR_FRAMES[0].id;
export const isAvatarFrame = (value) =>
  AVATAR_FRAMES.some((frame) => frame.id === value);
