import { describe, expect, it } from 'vitest'
import { dayItems, nudgeQty, notDeliveredItems, parseQty, progressOf, qtyText, stopState } from '../src/screens/today/todayHelpers'

describe('today helpers', () => {
  it('counts ticked stops', () => {
    expect(progressOf([])).toEqual({ done: 0, total: 0 })
    expect(progressOf([{ ticked: true }, { ticked: false }, { ticked: true }])).toEqual({ done: 2, total: 3 })
  })

  it('classifies a stop', () => {
    expect(stopState([{ plannedMl: 1000, qtyMl: 1000 }])).toBe('asPlanned')
    expect(stopState([{ plannedMl: 1000, qtyMl: 1500 }, { plannedMl: 500, qtyMl: 500 }])).toBe('changed')
    expect(stopState([{ plannedMl: 1000, qtyMl: 0 }, { plannedMl: 500, qtyMl: 0 }])).toBe('none')
    expect(stopState([{ plannedMl: 0, qtyMl: 0 }])).toBe('none')
  })

  it('parses and formats litres as whole millilitres', () => {
    expect(parseQty('1.5')).toBe(1500)
    expect(parseQty('.25')).toBe(250)
    expect(parseQty('abc')).toBeNull()
    expect(parseQty('')).toBeNull()
    expect(qtyText(1500)).toBe('1.5')
    expect(qtyText(0)).toBe('0')
  })

  it('nudges without going below zero', () => {
    expect(nudgeQty('1', 250, 0)).toBe('1.25')
    expect(nudgeQty('0.25', -500, 0)).toBe('0')
    expect(nudgeQty('x', 250, 1000)).toBe('1.25')
  })

  it('builds the lines to save', () => {
    expect(dayItems([{ milkTypeId: 1, text: '1.5' }, { milkTypeId: 2, text: '0' }])).toEqual([
      { milkTypeId: 1, qtyMl: 1500 },
      { milkTypeId: 2, qtyMl: 0 },
    ])
    expect(dayItems([{ milkTypeId: 1, text: '1.' + '5x' }])).toBeNull()
    expect(notDeliveredItems([{ milkTypeId: 3 }])).toEqual([{ milkTypeId: 3, qtyMl: 0 }])
  })
})
