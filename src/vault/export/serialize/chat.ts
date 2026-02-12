function now(): string {
  return new Date().toISOString();
}

/**
 * Serialize a ChatMessage into append-only JSONL-friendly structure.
 *
 * Intended Uses:
 *  - Metrics
 *  - Bot ingestion
 *  - Event analysis
 *  - Funny tavern statistics
 */
function normalizeRoll(r: any) {
  if (!r) return r;
  // Foundry Roll objects usually implement toJSON()
  if (typeof r.toJSON === "function") return r.toJSON();
  // Sometimes they’re already plain objects
  return r;
}

function safeUuid(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  return typeof v?.uuid === "string" ? v.uuid : null;
}

function pickDnd5eContext(flags: any) {
  const d = flags?.dnd5e ?? {};
  const item = d.item ?? {};
  const activity = d.activity ?? {};
  const roll = d.roll ?? {};

  return {
    messageType: d.messageType ?? null,              // "usage" | "roll" | ...
    originatingMessage: d.originatingMessage ?? null,

    itemId: item.id ?? null,
    itemUuid: item.uuid ?? null,
    itemType: item.type ?? null,

    activityId: activity.id ?? null,
    activityUuid: activity.uuid ?? null,
    activityType: activity.type ?? null,

    rollType: roll.type ?? null,                     // "attack" | "damage" | ...
    attackMode: roll.attackMode ?? null,

    targets: Array.isArray(d.targets) ? d.targets : [] // [{name, uuid, ac, img}, ...]
  };
}

function damagePartsFromRolls(rolls: any[], flags: any) {
  // Works for dnd5e DamageRoll JSON which includes options.type and formula/total.
  const parts: Array<{ type: string | null; formula: string | null; total: number | null }> = [];

  for (const r of rolls ?? []) {
    const type = r?.options?.type ?? null;
    const formula = r?.formula ?? null;
    const total = typeof r?.total === "number" ? r.total : null;
    if (type || formula || total !== null) parts.push({ type, formula, total });
  }

  // If dnd5e flags has damage types somewhere else later, you can merge it here.
  return parts.length ? parts : null;
}

export function serializeChatMessage(msg: ChatMessage) {
  const doc = msg.toObject() as any;

  // V12+ systems may migrate user -> author (e.g. ChatMessage5e)
  const authorId =
    doc.author ??
    doc.user ??
    (msg as any).author?.id ??
    null;

  // Prefer runtime rolls if available, then serialized doc.rolls/doc.roll fallback.
  const rawRolls =
    (msg as any).rolls ??
    doc.rolls ??
    (doc.roll ? [doc.roll] : []) ??
    [];

  const rollsArr = Array.isArray(rawRolls) ? rawRolls : [rawRolls];
  const rolls = rollsArr
    .filter(Boolean)
    .map(normalizeRoll)
    .map((r) => foundry.utils.deepClone(r));

  const flavor =
    doc.flavor ??
    doc?.flags?.dnd5e?.flavor ??
    doc?.flags?.core?.flavor ??
    null;

  const isRoll =
    Boolean((msg as any).isRoll) ||
    rolls.length > 0 ||
    Boolean(doc.roll) ||
    Boolean(doc.rolls);

  const dnd5eContext = pickDnd5eContext(doc.flags);

  const damageParts = dnd5eContext.rollType === "damage"
    ? damagePartsFromRolls(rolls as any[], doc.flags)
    : null;

  const damageTotal = Array.isArray(damageParts)
    ? damageParts.reduce((sum, p) => sum + (p.total ?? 0), 0)
    : null;

  // Snapshot current targets at time of serialization (best-effort).
  // Useful for “who did this attack/damage apply to?”
  const targets =
    game.user?.targets
      ? Array.from(game.user.targets)
          .map((t: any) => safeUuid(t?.document) ?? safeUuid(t))
          .filter(Boolean)
      : [];



  return {
    id: msg.id,
    timestamp: doc.timestamp ?? Date.now(),

    author: authorId,
    speaker: doc.speaker ?? null,

    type: doc.type ?? null,
    content: doc.content ?? "",

    // extras that help downstream parsing
    isRoll,
    flavor,
    rolls,

    // other common message fields
    whisper: doc.whisper ?? [],
    blind: !!doc.blind,
    emote: doc.emote ?? false,
    sound: doc.sound ?? null,

    // keep all flags for maximum reconstructability
    flags: foundry.utils.deepClone(doc.flags ?? {}),

    targets: targets,                 // your UUID list (keep)
    targetDetails: dnd5eContext.targets?.length ? dnd5eContext.targets : undefined,

    context: {
      ...dnd5eContext,
      damageParts: damageParts ?? undefined,
      damageTotal: damageTotal ?? undefined,
    },

    _meta: {
      schema: 1,
      source: "foundry",
      worldId: game.world.id,
      systemId: game.system.id,
      exportedAt: now()
    }
  };
}