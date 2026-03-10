// src/export/item/spellClassMap.ts

export type SpellClass =
  | "artificer"
  | "bard"
  | "cleric"
  | "druid"
  | "paladin"
  | "ranger"
  | "sorcerer"
  | "warlock"
  | "wizard";

const SPELL_CLASSES_BY_IDENTIFIER: Record<string, SpellClass[]> = {
  // cantrips
  "acid-splash": ["sorcerer", "wizard"],
  "blade-ward": ["bard", "sorcerer", "warlock", "wizard"],
  "chill-touch": ["sorcerer", "warlock", "wizard"],
  "dancing-lights": ["artificer", "bard", "sorcerer", "wizard"],
  "fire-bolt": ["artificer", "sorcerer", "wizard"],
  "guidance": ["cleric", "druid"],
  "light": ["bard", "cleric", "sorcerer", "wizard"],
  "mage-hand": ["artificer", "bard", "sorcerer", "warlock", "wizard"],
  "mending": ["artificer", "bard", "cleric", "druid", "wizard"],
  "message": ["artificer", "bard", "sorcerer", "wizard"],
  "poison-spray": ["druid", "sorcerer", "warlock", "wizard"],
  "prestidigitation": ["bard", "sorcerer", "warlock", "wizard"],
  "ray-of-frost": ["sorcerer", "wizard"],
  "resistance": ["cleric", "druid"],
  "sacred-flame": ["cleric"],
  "shillelagh": ["druid"],
  "spare-the-dying": ["cleric"],
  "thaumaturgy": ["cleric"],
  "thorn-whip": ["druid"],
  "toll-the-dead": ["cleric", "warlock", "wizard"],
  "true-strike": ["bard", "sorcerer", "warlock", "wizard"],
  "vicious-mockery": ["bard"],

  // level 1
  "bane": ["bard", "cleric"],
  "bless": ["cleric", "paladin"],
  "burning-hands": ["sorcerer", "wizard"],
  "charm-person": ["bard", "druid", "sorcerer", "warlock", "wizard"],
  "chromatic-orb": ["sorcerer", "wizard"],
  "cure-wounds": ["bard", "cleric", "druid", "paladin", "ranger"],
  "detect-magic": ["artificer", "bard", "cleric", "druid", "paladin", "ranger", "sorcerer", "wizard"],
  "detect-evil-and-good": ["cleric", "paladin"],
  "detect-poison-and-disease": ["cleric", "druid", "paladin", "ranger"],
  "disguise-self": ["bard", "sorcerer", "wizard"],
  "divine-favor": ["paladin"],
  "entangle": ["druid", "ranger"],
  "faerie-fire": ["bard", "druid"],
  "feather-fall": ["bard", "sorcerer", "wizard"],
  "find-familiar": ["wizard"],
  "guiding-bolt": ["cleric"],
  "healing-word": ["bard", "cleric", "druid"],
  "heroism": ["bard", "paladin"],
  "hex": ["warlock"],
  "hunters-mark": ["ranger"],
  "identify": ["artificer", "bard", "wizard"],
  "inflict-wounds": ["cleric"],
  "mage-armor": ["sorcerer", "wizard"],
  "magic-missile": ["sorcerer", "wizard"],
  "protection-from-evil-and-good": ["cleric", "paladin", "warlock", "wizard"],
  "shield": ["artificer", "sorcerer", "wizard"],
  "shield-of-faith": ["cleric", "paladin"],
  "sleep": ["bard", "sorcerer", "wizard"],
  "thunderwave": ["bard", "druid", "wizard"],
  "unseen-servant": ["bard", "warlock", "wizard"],

  // level 2
  "aid": ["artificer", "cleric", "paladin"],
  "blur": ["sorcerer", "wizard"],
  "darkness": ["sorcerer", "warlock", "wizard"],
  "enhance-ability": ["artificer", "bard", "cleric", "druid", "sorcerer", "wizard"],
  "find-steed": ["paladin"],
  "flaming-sphere": ["druid", "wizard"],
  "hold-person": ["bard", "cleric", "druid", "sorcerer", "warlock", "wizard"],
  "invisibility": ["artificer", "bard", "sorcerer", "warlock", "wizard"],
  "lesser-restoration": ["artificer", "bard", "cleric", "druid", "paladin", "ranger"],
  "misty-step": ["sorcerer", "warlock", "wizard"],
  "moonbeam": ["druid"],
  "prayer-of-healing": ["cleric"],
  "scorching-ray": ["sorcerer", "wizard"],
  "see-invisibility": ["bard", "sorcerer", "wizard"],
  "shatter": ["artificer", "bard", "sorcerer", "wizard"],
  "silence": ["bard", "cleric", "ranger"],
  "spiritual-weapon": ["cleric"],
  "suggestion": ["bard", "sorcerer", "warlock", "wizard"],
  "web": ["artificer", "sorcerer", "wizard"],

  // level 3
  "beacon-of-hope": ["cleric"],
  "counterspell": ["sorcerer", "warlock", "wizard"],
  "daylight": ["cleric", "druid", "paladin", "ranger", "sorcerer"],
  "dispel-magic": ["bard", "cleric", "druid", "paladin", "sorcerer", "warlock", "wizard"],
  "fireball": ["sorcerer", "wizard"],
  "fly": ["sorcerer", "warlock", "wizard"],
  "glyph-of-warding": ["bard", "cleric", "wizard"],
  "haste": ["sorcerer", "wizard"],
  "lightning-bolt": ["wizard", "sorcerer"],
  "mass-healing-word": ["cleric"],
  "protection-from-energy": ["cleric", "druid", "ranger", "sorcerer", "wizard"],
  "remove-curse": ["cleric", "paladin", "warlock", "wizard"],
  "revivify": ["cleric", "paladin"],
  "sending": ["bard", "cleric", "wizard"],
  "slow": ["sorcerer", "wizard"],
  "spirit-guardians": ["cleric"],
  "tongues": ["cleric", "sorcerer", "warlock", "wizard"],
  "water-breathing": ["druid", "ranger", "sorcerer", "wizard"],

  // level 4
  "banishment": ["cleric", "paladin", "sorcerer", "warlock", "wizard"],
  "blight": ["druid", "sorcerer", "warlock", "wizard"],
  "confusion": ["bard", "cleric", "druid", "sorcerer", "wizard"],
  "dimension-door": ["bard", "sorcerer", "warlock", "wizard"],
  "fire-shield": ["wizard", "sorcerer"],
  "freedom-of-movement": ["bard", "cleric", "druid", "ranger"],
  "greater-invisibility": ["bard", "sorcerer", "wizard"],
  "guardian-of-faith": ["cleric"],
  "ice-storm": ["druid", "sorcerer", "wizard"],
  "locate-creature": ["bard", "cleric", "druid", "paladin", "ranger", "wizard"],
  "phantasmal-killer": ["wizard"],
  "polymorph": ["bard", "druid", "sorcerer", "wizard"],
  "stone-shape": ["cleric", "druid", "wizard"],
  "wall-of-fire": ["druid", "sorcerer", "wizard"],

  // level 5
  "animate-objects": ["bard", "sorcerer", "wizard"],
  "awaken": ["bard", "druid"],
  "circle-of-power": ["paladin"],
  "cone-of-cold": ["sorcerer", "wizard"],
  "conjure-elemental": ["druid", "wizard"],
  "contact-other-plane": ["warlock", "wizard"],
  "creation": ["bard", "sorcerer", "wizard"],
  "dispel-evil-and-good": ["cleric", "paladin"],
  "flame-strike": ["cleric"],
  "greater-restoration": ["bard", "cleric", "druid", "artificer"],
  "hold-monster": ["bard", "sorcerer", "warlock", "wizard"],
  "mass-cure-wounds": ["bard", "cleric", "druid"],
  "planar-binding": ["bard", "cleric", "druid", "wizard"],
  "raise-dead": ["bard", "cleric", "paladin"],
  "reincarnate": ["druid"],
  "scrying": ["bard", "cleric", "druid", "warlock", "wizard"],
  "telekinesis": ["sorcerer", "wizard"],
  "wall-of-force": ["wizard"],
  "wall-of-stone": ["druid", "wizard"],

  // level 6
  "blade-barrier": ["cleric"],
  "chain-lightning": ["sorcerer", "wizard"],
  "circle-of-death": ["sorcerer", "warlock", "wizard"],
  "disintegrate": ["sorcerer", "wizard"],
  "find-the-path": ["bard", "cleric", "druid"],
  "flesh-to-stone": ["sorcerer", "wizard"],
  "globe-of-invulnerability": ["wizard"],
  "harm": ["cleric"],
  "heal": ["cleric", "druid"],
  "heroes-feast": ["cleric", "druid"],
  "mass-suggestion": ["bard", "sorcerer", "warlock", "wizard"],
  "move-earth": ["druid", "sorcerer", "wizard"],
  "sunbeam": ["druid", "sorcerer", "wizard"],
  "true-seeing": ["bard", "cleric", "druid", "sorcerer", "wizard"],

  // level 7
  "delayed-blast-fireball": ["sorcerer", "wizard"],
  "etherealness": ["bard", "cleric", "sorcerer", "warlock", "wizard"],
  "finger-of-death": ["sorcerer", "warlock", "wizard"],
  "fire-storm": ["cleric", "druid", "sorcerer"],
  "plane-shift": ["cleric", "druid", "sorcerer", "warlock", "wizard"],
  "regenerate": ["bard", "cleric", "druid"],
  "resurrection": ["bard", "cleric"],
  "reverse-gravity": ["druid", "sorcerer", "wizard"],
  "teleport": ["bard", "sorcerer", "wizard"],

  // level 8
  "earthquake": ["cleric", "druid", "sorcerer"],
  "feeblemind": ["bard", "druid", "warlock", "wizard"],
  "holy-aura": ["cleric"],
  "incendiary-cloud": ["sorcerer", "wizard"],
  "maze": ["wizard"],
  "mind-blank": ["bard", "wizard"],
  "power-word-stun": ["bard", "sorcerer", "warlock", "wizard"],
  "sunburst": ["cleric", "druid", "sorcerer", "wizard"],

  // level 9
  "astral-projection": ["cleric", "warlock", "wizard"],
  "foresight": ["bard", "druid", "warlock", "wizard"],
  "gate": ["cleric", "sorcerer", "wizard"],
  "mass-heal": ["cleric"],
  "meteor-swarm": ["sorcerer", "wizard"],
  "power-word-heal": ["bard", "cleric"],
  "power-word-kill": ["bard", "sorcerer", "warlock", "wizard"],
  "shapechange": ["druid", "wizard"],
  "time-stop": ["sorcerer", "wizard"],
  "true-polymorph": ["bard", "warlock", "wizard"],
  "true-resurrection": ["cleric", "druid"],
  "wish": ["sorcerer", "wizard"],
};

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function normalizeIdentifier(input: string): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getSpellClassesForIdentifier(identifier: string): SpellClass[] {
  const key = normalizeIdentifier(identifier);
  return SPELL_CLASSES_BY_IDENTIFIER[key] ? [...SPELL_CLASSES_BY_IDENTIFIER[key]] : [];
}

export function hasSpellClass(identifier: string, cls: string): boolean {
  const want = normalizeIdentifier(cls);
  return getSpellClassesForIdentifier(identifier).includes(want as SpellClass);
}

export function getAllMappedSpellIdentifiers(): string[] {
  return Object.keys(SPELL_CLASSES_BY_IDENTIFIER).sort();
}

export function mergeSpellClasses(
  identifier: string,
  extra: string[] | null | undefined
): SpellClass[] {
  const base = getSpellClassesForIdentifier(identifier);
  const more = (extra ?? [])
    .map((x) => normalizeIdentifier(x))
    .filter(Boolean) as SpellClass[];
  return uniq([...base, ...more]).sort();
}