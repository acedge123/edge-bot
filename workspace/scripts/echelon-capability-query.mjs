const SKILL_ALIASES = new Map([
  ['email', 'secure-gmail'],
  ['gmail', 'secure-gmail'],
  ['secure gmail', 'secure-gmail'],
]);

function normalizeSkillName(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return SKILL_ALIASES.get(normalized) || normalized.replace(/\s+/g, '-');
}

/** Return a deterministic response for narrow installed-skill questions. */
export function answerCapabilityQuery(requestText, hasSkill) {
  const text = String(requestText || '').trim();
  const patterns = [
    /^(?:do|did) you (?:still )?have (?:the )?(.+?) skill\??$/i,
    /^is (?:the )?(.+?) skill (?:still )?(?:installed|available)\??$/i,
    /^can you (?:still )?(?:access|use) (gmail|email)\??$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const skill = normalizeSkillName(match[1]);
    const installed = hasSkill(skill);
    return installed
      ? `Yes. The \`${skill}\` skill is installed in this EdgeBot runtime.`
      : `No. The \`${skill}\` skill is not installed in this EdgeBot runtime.`;
  }

  return null;
}
