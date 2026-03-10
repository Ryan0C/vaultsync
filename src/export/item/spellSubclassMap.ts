// src/export/item/spellSubclassMap.ts

export type SpellSubclass =
  | "cleric.arcana"
  | "cleric.death"
  | "cleric.forge"
  | "cleric.knowledge"
  | "cleric.life"
  | "cleric.light"
  | "cleric.nature"
  | "cleric.order"
  | "cleric.peace"
  | "cleric.tempest"
  | "cleric.trickery"
  | "cleric.twilight"
  | "cleric.war"
  | "paladin.ancients"
  | "paladin.conquest"
  | "paladin.crown"
  | "paladin.devotion"
  | "paladin.glory"
  | "paladin.redemption"
  | "paladin.vengeance"
  | "paladin.watchers"
  | "paladin.oathbreaker"
  | "ranger.fey-wanderer"
  | "ranger.gloom-stalker"
  | "ranger.horizon-walker"
  | "ranger.swarmkeeper"
  | "sorcerer.aberrant-mind"
  | "sorcerer.clockwork-soul"
  | "sorcerer.divine-soul"
  | "warlock.archfey"
  | "warlock.celestial"
  | "warlock.fathomless"
  | "warlock.fiend"
  | "warlock.genie"
  | "warlock.great-old-one"
  | "warlock.hexblade";

type SpellListBySubclass = Record<SpellSubclass, readonly string[]>;

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function normalizeKey(input: string): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SPELLS_BY_SUBCLASS: SpellListBySubclass = {
  "cleric.arcana": [
    "detect-magic",
    "magic-missile",
    "magic-weapon",
    "nystuls-magic-aura",
    "dispel-magic",
    "magic-circle",
    "arcane-eye",
    "leomunds-secret-chest",
    "planar-binding",
    "teleportation-circle",
  ],

  "cleric.death": [
    "false-life",
    "ray-of-sickness",
    "blindness-deafness",
    "ray-of-enfeeblement",
    "animate-dead",
    "vampiric-touch",
    "blight",
    "death-ward",
    "antilife-shell",
    "cloudkill",
  ],

  "cleric.forge": [
    "identify",
    "searing-smite",
    "heat-metal",
    "magic-weapon",
    "elemental-weapon",
    "protection-from-energy",
    "fabricate",
    "wall-of-fire",
    "animate-objects",
    "creation",
  ],

  "cleric.knowledge": [
    "command",
    "identify",
    "augury",
    "suggestion",
    "nondetection",
    "speak-with-dead",
    "arcane-eye",
    "confusion",
    "legend-lore",
    "scrying",
  ],

  "cleric.life": [
    "bless",
    "cure-wounds",
    "lesser-restoration",
    "spiritual-weapon",
    "beacon-of-hope",
    "revivify",
    "death-ward",
    "guardian-of-faith",
    "mass-cure-wounds",
    "raise-dead",
  ],

  "cleric.light": [
    "burning-hands",
    "faerie-fire",
    "flaming-sphere",
    "scorching-ray",
    "daylight",
    "fireball",
    "guardian-of-faith",
    "wall-of-fire",
    "flame-strike",
    "scrying",
  ],

  "cleric.nature": [
    "animal-friendship",
    "speak-with-animals",
    "barkskin",
    "spike-growth",
    "plant-growth",
    "wind-wall",
    "dominate-beast",
    "grasping-vine",
    "insect-plague",
    "tree-stride",
  ],

  "cleric.order": [
    "command",
    "heroism",
    "hold-person",
    "zone-of-truth",
    "mass-healing-word",
    "slow",
    "compulsion",
    "locate-creature",
    "commune",
    "dominate-person",
  ],

  "cleric.peace": [
    "heroism",
    "sanctuary",
    "aid",
    "warding-bond",
    "beacon-of-hope",
    "sending",
    "otilukes-resilient-sphere",
    "stoneskin",
    "greater-restoration",
  ],

  "cleric.tempest": [
    "fog-cloud",
    "thunderwave",
    "gust-of-wind",
    "shatter",
    "call-lightning",
    "sleet-storm",
    "control-water",
    "ice-storm",
    "destructive-wave",
    "insect-plague",
  ],

  "cleric.trickery": [
    "charm-person",
    "disguise-self",
    "mirror-image",
    "pass-without-trace",
    "blink",
    "dispel-magic",
    "dimension-door",
    "polymorph",
    "dominate-person",
    "modify-memory",
  ],

  "cleric.twilight": [
    "faerie-fire",
    "sleep",
    "moonbeam",
    "see-invisibility",
    "aura-of-vitality",
    "leomunds-tiny-hut",
    "aura-of-life",
    "greater-invisibility",
    "circle-of-power",
    "mislead",
  ],

  "cleric.war": [
    "divine-favor",
    "shield-of-faith",
    "magic-weapon",
    "spiritual-weapon",
    "crusaders-mantle",
    "spirit-guardians",
    "freedom-of-movement",
    "stoneskin",
    "flame-strike",
    "hold-monster",
  ],

  "paladin.ancients": [
    "ensnaring-strike",
    "speak-with-animals",
    "moonbeam",
    "misty-step",
    "plant-growth",
    "protection-from-energy",
    "ice-storm",
    "stoneskin",
    "commune-with-nature",
    "tree-stride",
  ],

  "paladin.conquest": [
    "armor-of-agathys",
    "command",
    "hold-person",
    "spiritual-weapon",
    "bestow-curse",
    "fear",
    "dominate-beast",
    "stoneskin",
    "cloudkill",
    "dominate-person",
  ],

  "paladin.crown": [
    "command",
    "compelled-duel",
    "warding-bond",
    "zone-of-truth",
    "aura-of-vitality",
    "spirit-guardians",
    "banishment",
    "guardian-of-faith",
    "circle-of-power",
    "geas",
  ],

  "paladin.devotion": [
    "protection-from-evil-and-good",
    "sanctuary",
    "lesser-restoration",
    "zone-of-truth",
    "beacon-of-hope",
    "dispel-magic",
    "freedom-of-movement",
    "guardian-of-faith",
    "commune",
    "flame-strike",
  ],

  "paladin.glory": [
    "guiding-bolt",
    "heroism",
    "enhance-ability",
    "magic-weapon",
    "haste",
    "protection-from-energy",
    "compulsion",
    "freedom-of-movement",
    "commune",
    "flame-strike",
  ],

  "paladin.redemption": [
    "sanctuary",
    "sleep",
    "calm-emotions",
    "hold-person",
    "counterspell",
    "hypnotic-pattern",
    "otilukes-resilient-sphere",
    "stoneskin",
    "hold-monster",
    "wall-of-force",
  ],

  "paladin.vengeance": [
    "bane",
    "hunters-mark",
    "hold-person",
    "misty-step",
    "haste",
    "protection-from-energy",
    "banishment",
    "dimension-door",
    "hold-monster",
    "scrying",
  ],

  "paladin.watchers": [
    "alarm",
    "detect-magic",
    "moonbeam",
    "see-invisibility",
    "counterspell",
    "nondetection",
    "aura-of-purity",
    "banishment",
    "hold-monster",
    "scrying",
  ],

  "paladin.oathbreaker": [
    "hellish-rebuke",
    "inflict-wounds",
    "crown-of-madness",
    "darkness",
    "animate-dead",
    "bestow-curse",
    "blight",
    "confusion",
    "contagion",
    "dominate-person",
  ],

  "ranger.fey-wanderer": [
    "charm-person",
    "misty-step",
    "dispel-magic",
    "dimension-door",
    "mislead",
  ],

  "ranger.gloom-stalker": [
    "disguise-self",
    "rope-trick",
    "fear",
    "greater-invisibility",
    "mislead",
  ],

  "ranger.horizon-walker": [
    "protection-from-evil-and-good",
    "misty-step",
    "haste",
    "banishment",
    "teleportation-circle",
  ],

  "ranger.swarmkeeper": [
    "faerie-fire",
    "web",
    "gaseous-form",
    "arcane-eye",
    "insect-plague",
  ],

  "sorcerer.aberrant-mind": [
    "arms-of-hadar",
    "dissonant-whispers",
    "calm-emotions",
    "detect-thoughts",
    "hunger-of-hadar",
    "sending",
    "evards-black-tentacles",
    "summon-aberration",
    "raulothims-psychic-lance",
    "telekinesis",
    "rarys-telepathic-bond",
  ],

  "sorcerer.clockwork-soul": [
    "alarm",
    "protection-from-evil-and-good",
    "aid",
    "lesser-restoration",
    "dispel-magic",
    "protection-from-energy",
    "freedom-of-movement",
    "summon-construct",
    "greater-restoration",
    "wall-of-force",
  ],

  "sorcerer.divine-soul": [
    "bless",
    "cure-wounds",
    "guiding-bolt",
    "spirit-guardians",
    "flame-strike",
    "heal",
  ],

  "warlock.archfey": [
    "faerie-fire",
    "sleep",
    "calm-emotions",
    "phantasmal-force",
    "blink",
    "plant-growth",
    "dominate-beast",
    "greater-invisibility",
    "dominate-person",
    "seeming",
  ],

  "warlock.celestial": [
    "cure-wounds",
    "guiding-bolt",
    "flaming-sphere",
    "lesser-restoration",
    "daylight",
    "revivify",
    "guardian-of-faith",
    "wall-of-fire",
    "flame-strike",
    "greater-restoration",
  ],

  "warlock.fathomless": [
    "create-or-destroy-water",
    "thunderwave",
    "gust-of-wind",
    "silence",
    "lightning-bolt",
    "sleet-storm",
    "control-water",
    "summon-elemental",
    "bigbys-hand",
    "cone-of-cold",
  ],

  "warlock.fiend": [
    "burning-hands",
    "command",
    "blindness-deafness",
    "scorching-ray",
    "fireball",
    "stinking-cloud",
    "fire-shield",
    "wall-of-fire",
    "flame-strike",
    "hallow",
  ],

  "warlock.genie": [
    "detect-evil-and-good",
    "sanctuary",
    "phantasmal-force",
    "spike-growth",
    "create-food-and-water",
    "tongues",
    "phantasmal-killer",
    "greater-invisibility",
    "creation",
    "seeming",
  ],

  "warlock.great-old-one": [
    "dissonant-whispers",
    "tashas-hideous-laughter",
    "detect-thoughts",
    "phantasmal-force",
    "clairvoyance",
    "sending",
    "dominate-beast",
    "evards-black-tentacles",
    "dominate-person",
    "telekinesis",
  ],

  "warlock.hexblade": [
    "shield",
    "wrathful-smite",
    "blur",
    "branding-smite",
    "blink",
    "elemental-weapon",
    "phantasmal-killer",
    "staggering-smite",
    "banishing-smite",
    "cone-of-cold",
  ],
};

function buildSpellSubclassesByIdentifier(
  lists: SpellListBySubclass
): Record<string, SpellSubclass[]> {
  const out: Record<string, SpellSubclass[]> = {};

  for (const [subclass, ids] of Object.entries(lists) as Array<[SpellSubclass, readonly string[]]>) {
    for (const rawId of ids) {
      const id = normalizeKey(rawId);
      if (!id) continue;

      if (!out[id]) out[id] = [];
      out[id].push(subclass);
    }
  }

  for (const id of Object.keys(out)) {
    out[id] = uniq(out[id]).sort();
  }

  return out;
}

const SPELL_SUBCLASSES_BY_IDENTIFIER = buildSpellSubclassesByIdentifier(SPELLS_BY_SUBCLASS);

export function getSpellSubclassesForIdentifier(identifier: string): SpellSubclass[] {
  const key = normalizeKey(identifier);
  return SPELL_SUBCLASSES_BY_IDENTIFIER[key]
    ? [...SPELL_SUBCLASSES_BY_IDENTIFIER[key]]
    : [];
}

export function hasSpellSubclass(identifier: string, subclass: string): boolean {
  const want = normalizeKey(subclass);
  return getSpellSubclassesForIdentifier(identifier).includes(want as SpellSubclass);
}

export function getAllMappedSpellSubclassIdentifiers(): string[] {
  return Object.keys(SPELL_SUBCLASSES_BY_IDENTIFIER).sort();
}

export function mergeSpellSubclasses(
  identifier: string,
  extra: string[] | null | undefined
): SpellSubclass[] {
  const base = getSpellSubclassesForIdentifier(identifier);
  const more = (extra ?? [])
    .map((x) => normalizeKey(x))
    .filter(Boolean) as SpellSubclass[];

  return uniq([...base, ...more]).sort();
}