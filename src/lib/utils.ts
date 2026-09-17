import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

/** Fuzzy-ish comparison used to spot duplicate customers created by a scan. */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    // Strip accents so "Kōwhai" and "Kowhai" are treated as the same word.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(ltd|limited|pty|inc|co)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Comparison key for a phone number: the last 8 digits. That sidesteps
 * country codes, trunk zeros and every spacing convention people use, without
 * hardcoding a region's dialling rules. Returns '' for anything too short to
 * identify someone.
 */
export function normalisePhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/[^0-9]/g, '')
  return digits.length >= 8 ? digits.slice(-8) : ''
}
