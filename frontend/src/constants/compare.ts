export type CompareSide = 'a' | 'b'

export const COMPARE_COLORS: Record<CompareSide, string> = {
  a: '#38BDF8',
  b: '#FF6A1A',
}

export interface CompareYears {
  a: number
  b: number
}
