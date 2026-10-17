import {
  Folder, Bike, Gamepad2, Camera, Music2, Heart, Flame, Sparkles, Zap, Rocket,
  PawPrint, ChefHat, Dumbbell, Plane, Car, Clapperboard, Palette, BookOpen,
  Crown, Ghost, Laugh, Mountain, PartyPopper, Star,
} from "lucide-react";

const ICONS = {
  folder: Folder, bike: Bike, gamepad: Gamepad2, camera: Camera, music: Music2,
  heart: Heart, flame: Flame, sparkles: Sparkles, zap: Zap, rocket: Rocket,
  paw: PawPrint, chef: ChefHat, dumbbell: Dumbbell, plane: Plane, car: Car,
  clapperboard: Clapperboard, palette: Palette, book: BookOpen, crown: Crown,
  ghost: Ghost, laugh: Laugh, mountain: Mountain, party: PartyPopper, star: Star,
};

export default function FolderGlyph({ icon = "folder", size = 17, ...props }) {
  const Icon = ICONS[icon] || Folder;
  return <Icon size={size} {...props} />;
}
