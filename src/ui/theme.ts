/**
 * The brand, in the one place React Native can read it. Same values as
 * `design/mockups.html` and the bill PDF (`billHtml.ts`); change all three together.
 */
export const C = {
  navy: '#0F2A4A',
  blue: '#2563A8',
  blueText: '#1F5591',
  /** Fill of a day delivered as planned. */
  sky: '#E7EFF8',
  milk: '#F7F5EE',
  line: '#E6E2D6',
  ink: '#172233',
  /** Fill and text of a changed day. */
  amber: '#F4D9AE',
  amberText: '#8A4B0B',
  /** Fill of a day with no delivery. */
  none: '#EDEBE4',
  /** Fill, tint and text of a paused day (away on holiday). */
  paused: '#E3DCF4',
  pausedTint: '#F6F3FC',
  pausedText: '#4E3F86',
  butter: '#F2C14E',
  white: '#FFFFFF',
  danger: '#9F1239',
} as const

/** Ink at reduced weight, for secondary text. */
export const muted = 'rgba(23, 34, 51, 0.60)'
export const faint = 'rgba(23, 34, 51, 0.42)'

export const radius = { card: 18, control: 14, cell: 12, pill: 999 } as const

export const space = (n: number) => n * 4

/** Nunito for headings and figures, Hanken Grotesk for everything else. */
export const font = {
  display: 'Nunito800',
  body: 'HankenGrotesk',
} as const

export const FONT_FILES = {
  Nunito800: require('../../assets/fonts/Nunito-800.ttf'),
  HankenGrotesk: require('../../assets/fonts/HankenGrotesk-Regular.ttf'),
}
