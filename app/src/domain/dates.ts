/**
 * Доменные функции работы с датами.
 * Этап 1 плана: перенести из legacy index.html чистые функции
 * monthDiff, tenure, currentQuarterLabel, quarterMonths, quarterWorkDays,
 * daysInMonth, overlapsPeriod, startOfWeek с тестами.
 */

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function monthDiff(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}
