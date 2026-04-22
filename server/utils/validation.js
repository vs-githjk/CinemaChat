export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function sanitizeQuery(value, { maxLength = 400 } = {}) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

export function sanitizeText(value, { maxLength = 400 } = {}) {
  return sanitizeQuery(value, { maxLength });
}

export function sanitizeConversationHistory(value, { maxMessages = 24, maxChars = 500 } = {}) {
  if (!Array.isArray(value)) return [];

  const allowedRoles = new Set(['user', 'assistant']);
  const sanitized = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    if (!allowedRoles.has(item.role)) continue;
    if (typeof item.content !== 'string') continue;

    const content = item.content.trim().slice(0, maxChars);
    if (!content) continue;

    sanitized.push({ role: item.role, content });
    if (sanitized.length >= maxMessages) break;
  }

  return sanitized;
}

export function parsePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}
