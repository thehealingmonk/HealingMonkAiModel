// Public subscription plans for the AI assessment. Shared by the client (pricing
// page) and the server (order/verify routes). The server is authoritative on
// price and duration — the client only sends a plan id, never an amount.

export interface Plan {
  id: string;
  name: string;
  /** Price in rupees (the smallest-unit conversion to paise happens server-side). */
  priceINR: number;
  /** How long the subscription stays active, in days. */
  durationDays: number;
  tagline: string;
  features: string[];
  /** Highlight this plan as the recommended one on the pricing page. */
  featured?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    priceINR: 499,
    durationDays: 30,
    tagline: 'Try the full AI assessment',
    features: [
      'Unlimited AI posture assessments',
      'Full clinical-style reports',
      'Personalized exercise programs',
      'Shareable report links',
    ],
  },
  {
    id: 'quarterly',
    name: 'Quarterly',
    priceINR: 1299,
    durationDays: 90,
    tagline: 'Best for tracking progress',
    features: [
      'Everything in Monthly',
      'Progress tracking across sessions',
      'Priority processing',
      'Save ~13% vs monthly',
    ],
    featured: true,
  },
  {
    id: 'annual',
    name: 'Annual',
    priceINR: 3999,
    durationDays: 365,
    tagline: 'For the committed',
    features: [
      'Everything in Quarterly',
      'A full year of access',
      'Save ~33% vs monthly',
      'Email support',
    ],
  },
];

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
