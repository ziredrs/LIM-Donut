export const PICKUP_HOURS = Array.from({ length: 15 }, (_, i) => String(i + 7).padStart(2, '0'));
export const PICKUP_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function localDateValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function validPickupTime(time: string): boolean {
  return /^(?:0[7-9]|1\d|20):[0-5]\d$|^21:00$/.test(time);
}

export function displayPickupDate(value: string): string {
  return value ? value.split('-').reverse().join('/') : '';
}

export function parsePickupDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return '';
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  const iso = `${year}-${month}-${day}`;
  return Number.isFinite(date.getTime()) && localDateValue(date) === iso ? iso : '';
}
