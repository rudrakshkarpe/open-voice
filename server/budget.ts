// Demo abuse guard, not a monetary billing cap. Counters reset on UTC day/restart.
export class DailyBudget {
  private day = ''
  private used = 0
  constructor(private limit: number, private now = () => new Date()) {}
  take() {
    const day = this.now().toISOString().slice(0, 10)
    if (day !== this.day) { this.day = day; this.used = 0 }
    if (this.used >= this.limit) throw new Error('The public demo has reached its daily speech limit. Please try again tomorrow.')
    this.used++
  }
}

const configured = Number(process.env.DAILY_PROVIDER_REQUEST_LIMIT ?? (process.env.NODE_ENV === 'production' ? 300 : 10000))
if (!Number.isSafeInteger(configured) || configured < 1) throw new Error('DAILY_PROVIDER_REQUEST_LIMIT must be a positive integer.')
export const providerBudget = new DailyBudget(configured)
