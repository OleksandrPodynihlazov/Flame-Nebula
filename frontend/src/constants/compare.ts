export type CompareSide = 'a' | 'b'

export const COMPARE_COLORS: Record<CompareSide, string> = {
  a: '#38BDF8',
  b: '#FB923C',
}

export interface CompareYears {
  a: number
  b: number
}
