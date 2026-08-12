// Per-SKU forced-convection add-on for the «Гольфстрим КРК 24.08» in-floor
// convector line — pairs each base (natural-convection) product with the fan
// accessory + quantity that turns it into the «КВК 24В» forced-convection
// variant, plus both power figures. Sourced from the manufacturer's own
// natural/forced power tables (see the product's own description). There is
// no separate «КВК» catalog SKU — it's the base convector plus N fan units
// bought together — so this is a UI-only combo lookup rather than a DB
// variant, same spirit as the hardcoded overrides in categoryTiles.ts.
export interface ConvectorFanOption {
  fanSku: string
  fanSlug: string
  fanQty: number
  powerNaturalW: number
  powerForcedW: number
}

export const CONVECTOR_FAN_OPTIONS: Record<string, ConvectorFanOption> = {
  'GOLFSTREAM-KRK-800': {
    fanSku: 'GOLFSTREAM-FAN-1', fanSlug: 'ventilyator-dlya-konvektora-golfstrim', fanQty: 1,
    powerNaturalW: 144, powerForcedW: 694,
  },
  'GOLFSTREAM-KRK-1000': {
    fanSku: 'GOLFSTREAM-FAN-1', fanSlug: 'ventilyator-dlya-konvektora-golfstrim', fanQty: 1,
    powerNaturalW: 198, powerForcedW: 1087,
  },
  'GOLFSTREAM-KRK-1200': {
    fanSku: 'GOLFSTREAM-FAN-1', fanSlug: 'ventilyator-dlya-konvektora-golfstrim', fanQty: 2,
    powerNaturalW: 254, powerForcedW: 1660,
  },
  'GOLFSTREAM-KRK-1400': {
    fanSku: 'GOLFSTREAM-FAN-1', fanSlug: 'ventilyator-dlya-konvektora-golfstrim', fanQty: 2,
    powerNaturalW: 307, powerForcedW: 2100,
  },
  'GOLFSTREAM-KRK-1600': {
    fanSku: 'GOLFSTREAM-FAN-1', fanSlug: 'ventilyator-dlya-konvektora-golfstrim', fanQty: 3,
    powerNaturalW: 361, powerForcedW: 2169,
  },
  'GOLFSTREAM-KRK-1800': {
    fanSku: 'GOLFSTREAM-FAN-1', fanSlug: 'ventilyator-dlya-konvektora-golfstrim', fanQty: 3,
    powerNaturalW: 417, powerForcedW: 2660,
  },
  'GOLFSTREAM-KRK-2000': {
    fanSku: 'GOLFSTREAM-FAN-1', fanSlug: 'ventilyator-dlya-konvektora-golfstrim', fanQty: 4,
    powerNaturalW: 471, powerForcedW: 3313,
  },
  'GOLFSTREAM-KRK-2400': {
    fanSku: 'GOLFSTREAM-FAN-1', fanSlug: 'ventilyator-dlya-konvektora-golfstrim', fanQty: 5,
    powerNaturalW: 580, powerForcedW: 4198,
  },
  'GOLFSTREAM-KRK-3000': {
    fanSku: 'GOLFSTREAM-FAN-1', fanSlug: 'ventilyator-dlya-konvektora-golfstrim', fanQty: 6,
    powerNaturalW: 743, powerForcedW: 5103,
  },
}
