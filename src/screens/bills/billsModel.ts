/**
 * Pure pieces of the Bills tab: no React, no expo. What a bill row shows, the
 * header a bill is printed with, and the WhatsApp message and link for one
 * customer. Money is whole paise, milk whole millilitres.
 */
import { customerBillMessage, whatsappNumber, whatsappUrl } from '../../lib'
import type { IsoMonth, LedgerMonth, MonthBill } from '../../lib'
import type { BillHeader } from '../../billHtml'

export interface BillCustomer {
  id: number
  name: string
  phone: string
  address: string
  active: boolean
}

export interface BillSettings {
  businessName: string
  businessPhone: string
  language: BillHeader['lang']
}

/** Who a bill is from and to, in the saved language. */
export function billHeader(settings: BillSettings, customer: BillCustomer): BillHeader {
  return {
    customerId: customer.id,
    businessName: settings.businessName.trim(),
    businessPhone: settings.businessPhone.trim(),
    customerName: customer.name.trim(),
    customerPhone: customer.phone.trim(),
    customerAddress: customer.address.trim(),
    lang: settings.language,
  }
}

/** `none`: nothing to pay this month. `advance`: paid towards a month still running. */
export type BillStatus = 'none' | 'unpaid' | 'part' | 'paid' | 'advance'

export interface BillRow {
  customerId: number
  name: string
  hasPhone: boolean
  litresMl: number
  payablePaise: number
  paidPaise: number
  /** Still to pay on this bill, never below zero. */
  duePaise: number
  status: BillStatus
}

const totalMl = (bill: MonthBill): number => bill.types.reduce((s, t) => s + t.totalMl, 0)

export function billRow(customer: BillCustomer, bill: MonthBill, paid: LedgerMonth | undefined): BillRow {
  const paidPaise = paid?.paidPaise ?? 0
  const payablePaise = bill.payablePaise
  const duePaise = Math.max(0, payablePaise - paidPaise)
  let status: BillStatus
  if (payablePaise === 0 && paidPaise === 0) status = 'none'
  else if (paid && !paid.final && paidPaise > 0) status = 'advance'
  else if (paidPaise === 0) status = 'unpaid'
  else if (duePaise === 0) status = 'paid'
  else status = 'part'
  return {
    customerId: customer.id,
    name: customer.name,
    hasPhone: whatsappNumber(customer.phone) !== null,
    litresMl: totalMl(bill),
    payablePaise,
    paidPaise,
    duePaise,
    status,
  }
}

/** Customers with milk or a payment in the month, in the order given (route order). */
export function visibleRows(rows: BillRow[]): BillRow[] {
  return rows.filter((r) => r.status !== 'none')
}

export interface BillTotals {
  count: number
  litresMl: number
  payablePaise: number
  paidPaise: number
  duePaise: number
}

export function billTotals(rows: BillRow[]): BillTotals {
  return rows.reduce<BillTotals>(
    (t, r) => ({
      count: t.count + 1,
      litresMl: t.litresMl + r.litresMl,
      payablePaise: t.payablePaise + r.payablePaise,
      paidPaise: t.paidPaise + r.paidPaise,
      duePaise: t.duePaise + r.duePaise,
    }),
    { count: 0, litresMl: 0, payablePaise: 0, paidPaise: 0, duePaise: 0 },
  )
}

/** The bill message for a customer, and the wa.me link, or null when the customer has no usable phone. */
export function billWhatsApp(month: IsoMonth, row: BillRow, customer: BillCustomer, businessName: string): { text: string; url: string | null } {
  const text = customerBillMessage(month, row.litresMl, row.payablePaise, row.paidPaise, customer.name, businessName)
  return { text, url: whatsappNumber(customer.phone) ? whatsappUrl(customer.phone, text) : null }
}

/** Who "send all" walks through: customers with something to pay, in the order given. */
export function sendAllQueue(rows: BillRow[]): BillRow[] {
  return rows.filter((r) => r.payablePaise > 0)
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** `MilkBill-October-2026-Asha-Patil`, without extension: safe to use as a file name in any language. */
export function billFileName(month: IsoMonth, customerName: string): string {
  const [year, mm] = month.split('-')
  return `MilkBill-${MONTH_NAMES[Number(mm) - 1]}-${year}-${fileSafe(customerName)}`
}

/** `Receipt-2026-10-24-Asha-Patil`, without extension. */
export function receiptFileName(paidOn: string, customerName: string): string {
  return `Receipt-${paidOn}-${fileSafe(customerName)}`
}

/** Letters and digits of any language joined by single dashes. */
const fileSafe = (text: string): string => text.replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'Customer'
