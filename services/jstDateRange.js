const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getJstMonthRange(nowMs = Date.now()) {
  const nowJst = new Date(nowMs + JST_OFFSET_MS);
  const monthStartUtcMs = Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), 1) - JST_OFFSET_MS;
  const nextMonthStartUtcMs = Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth() + 1, 1) - JST_OFFSET_MS;
  return {
    monthStart: new Date(monthStartUtcMs).toISOString(),
    nextMonthStart: new Date(nextMonthStartUtcMs).toISOString(),
  };
}

export function getJstDayRange(nowMs = Date.now()) {
  const nowJst = new Date(nowMs + JST_OFFSET_MS);
  const dayStartUtcMs = Date.UTC(
    nowJst.getUTCFullYear(),
    nowJst.getUTCMonth(),
    nowJst.getUTCDate()
  ) - JST_OFFSET_MS;
  return {
    dayStart: new Date(dayStartUtcMs).toISOString(),
    nextDayStart: new Date(dayStartUtcMs + 24 * 60 * 60 * 1000).toISOString(),
  };
}
