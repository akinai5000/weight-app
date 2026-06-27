const DAY_MS = 86400000;

/** 体重記録の日付文字列をタイムスタンプに変換（`YYYY/M/D HH:mm` または `M/D HH:mm`） */
export function parseWeightRecordDate(dateStr: string, now: Date = new Date()): number {
  const withYear = dateStr.match(/^(\d{4})\/(\d+)\/(\d+)\s+(\d+):(\d+)$/);
  if (withYear) {
    return new Date(
      parseInt(withYear[1], 10),
      parseInt(withYear[2], 10) - 1,
      parseInt(withYear[3], 10),
      parseInt(withYear[4], 10),
      parseInt(withYear[5], 10),
    ).getTime();
  }

  const m = dateStr.match(/^(\d+)\/(\d+)\s+(\d+):(\d+)$/);
  if (!m) return now.getTime();
  const month = parseInt(m[1], 10) - 1;
  const day = parseInt(m[2], 10);
  const hour = parseInt(m[3], 10);
  const minute = parseInt(m[4], 10);
  let year = now.getFullYear();
  let candidate = new Date(year, month, day, hour, minute);
  if (candidate.getTime() > now.getTime()) {
    candidate = new Date(year - 1, month, day, hour, minute);
  }
  return candidate.getTime();
}

export { DAY_MS };
