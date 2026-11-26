import {
  Bird,
  Camera,
  Fish,
  Footprints,
  Landmark,
  Mountain,
  PawPrint,
  Ship,
  Sprout,
  Sunset,
  Tent,
  TreePalm,
  Users,
  Waves,
  Droplets,
  type LucideIcon,
} from "lucide-react";
import type { ActivityKey, CategoryKey } from "@/data/destinations";

export const activityIcons: Record<ActivityKey, LucideIcon> = {
  hiking: Footprints,
  waterfall: Droplets,
  swimming: Waves,
  birdwatching: Bird,
  photography: Camera,
  river: Ship,
  culture: Users,
  history: Landmark,
  camping: Tent,
  reforestation: Sprout,
  fishing: Fish,
  beach: TreePalm,
  sunset: Sunset,
  viewpoint: Mountain,
  wildlife: PawPrint,
};

/** Color de marcador por categoría principal (paleta de marca). */
export const categoryColor: Record<CategoryKey, string> = {
  cascadas: "#2E7D9A",
  rios: "#2E7D9A",
  selva: "#1F4D2B",
  aves: "#1F4D2B",
  ecoturismo: "#1F4D2B",
  playas: "#E3A21A",
  montanas: "#6B3F1D",
  aventura: "#D7261E",
  cultura: "#B5361F",
  comunidades: "#B5361F",
};
