# Économie & contenu avant-set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal**: Make money a decision for the whole run: night fees taken from the gross (never the bank), gear that branches into two exclusive paths from tier 3 with prices ×2.5 and tiers 4–5, recurring crew sinks (cadeau / jour off / studio), and enough content (4 DJs, 4 genres, 3 spots) to restretch the rep curve to 0–650 — all without ever violating no-softlock (PRD §4.3).

**Architecture**: Everything stays data-driven and pure-core: a new `src/core/economy.ts` holds the fee/caution/bar-stock math shared by `night.ts` (drip cap, caution heat) and `payout.ts` (settle/bust). Gear branches live in `data.ts` as flat `GearItem[]` with a `branch?: 'A'|'B'` field plus selector helpers; the sim reads branch perks through a typed `effects` bag mapped onto the *existing* levers (cap, churn, heat, quality, power, vibe, drop). UI stays thin in `screens.ts`/`strings.ts`; saves migrate v2→v3 by defaulting missing fields.

**Tech Stack**: TypeScript + Vite, vanilla DOM, vitest (`npm run test`), `tsc && vite build` (`npm run build`). Deterministic seeded RNG (`mulberry32`), French strings only.

**Chantier-1 dependency**: intensity crans / soundclash / arcs / descente are NOT implemented. Every place the spec needs them gets a working fallback marked `RÉVISION CHANTIER 1:` (also as a code comment) so chantier 1 can rewire it.

**Measured baseline** (current code, harness seeds): champ night-1 payout ≈ 185–254 €, cash after seeds 1+2 ≈ 492 €, rep after 4 nights ≈ 51. These numbers ground the harness updates below.

---

### Task 1: Frais de nuit sur le brut — essence, stock du bar, caution

**Files:**
- Create: `src/core/economy.ts`
- Create: `test/economy.test.ts`
- Modify: `src/core/types.ts` (NightState + NightResult fields, BarStock)
- Modify: `src/core/night.ts` (createNight opts, drip cap, start heat)
- Modify: `src/core/payout.ts` (fees on gross, caution refund/loss)
- Test: `npm run test`

- [ ] Write the failing test `test/economy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BAR_DRIP,
  BAR_STOCK_CAP,
  BAR_STOCK_COST,
  BRIEF_INTENSITY,
  ESSENCE_RATE,
  cautionCost,
  essenceCost,
  potentialBar,
} from '../src/core/economy';
import { getSpot } from '../src/core/data';
import { createNight, startSet, tickNight } from '../src/core/night';
import { applyBust, settleNight } from '../src/core/payout';
import { newGame } from '../src/core/save';
import type { GameState, NightState } from '../src/core/types';

/** Same shape as payout.test.ts: a champ night frozen at sunrise. */
function finishedNight(
  state: GameState,
  opts: { barStock?: 'leger' | 'normal' | 'large'; caution?: boolean } = {},
  overrides: Partial<NightState> = {},
): NightState {
  const night = createNight(state, 'champ', ['tonton'], 1, opts);
  Object.assign(night, {
    t: 180,
    phase: 'ended',
    sunrise: true,
    bank: 100,
    peakCrowd: 30,
    vibeSum: 0.8 * 180,
    vibeSamples: 180,
    peakHeat: 0.4,
    playedSets: [
      { djId: 'tonton', brief: 'normal' },
      { djId: 'tonton', brief: 'normal' },
    ],
  });
  return Object.assign(night, overrides);
}

describe('essence du groupe', () => {
  it('coûte 2 €/min pondérés par la consigne — gratuite au groupe poussif', () => {
    const state = newGame();
    const night = finishedNight(state, {}, {
      playedSets: [
        { djId: 'tonton', brief: 'normal' },
        { djId: 'tonton', brief: 'pousser' },
      ],
    });
    expect(essenceCost(state, night)).toBe(0); // groupe tier 0 : no-softlock
    state.gear.groupe = 1;
    // RÉVISION CHANTIER 1 : intensité = consigne (safe .25 / normal .5 / pousser 1)
    // 2 € × 3 min × (0.5 + (0.5 + 1) / 2) = 7.5 → 8
    expect(ESSENCE_RATE).toBe(2);
    expect(BRIEF_INTENSITY).toEqual({ safe: 0.25, normal: 0.5, pousser: 1 });
    expect(essenceCost(state, night)).toBe(8);
  });
});

describe('stock du bar', () => {
  it('expose les fractions coût/plafond du choix de prépa', () => {
    expect(BAR_DRIP).toBe(0.05); // déplacé de night.ts vers economy.ts
    expect(BAR_STOCK_COST).toEqual({ leger: 0, normal: 0.15, large: 0.3 });
    expect(BAR_STOCK_CAP).toEqual({ leger: 0.5, normal: 0.8, large: 1.1 });
  });

  it('plafonne la recette de la buvette au stock embarqué', () => {
    const state = newGame();
    const night = createNight(state, 'champ', ['tonton'], 2, { barStock: 'leger' });
    // potentiel = cap × drip × priceMult × durée = 36 × 0.05 × 1 × 180 = 324
    expect(potentialBar(getSpot('champ'), night.cap)).toBeCloseTo(324, 5);
    expect(night.barCap).toBeCloseTo(162, 5); // léger = 50 %
    startSet(state, night, 'tonton', 'normal');
    night.crowd = night.cap;
    night.barSales = night.barCap; // stock épuisé
    const bank = night.bank;
    tickNight(state, night, 1);
    expect(night.bank).toBe(bank); // plus rien à vendre
  });

  it('par défaut le stock est léger (zéro frais)', () => {
    const state = newGame();
    expect(createNight(state, 'champ', ['tonton'], 3).barStock).toBe('leger');
  });
});

describe('frais prélevés sur le brut, jamais sur la banque', () => {
  it('détaille essence + restock au payout', () => {
    const state = newGame();
    state.gear.groupe = 1;
    const night = finishedNight(state, { barStock: 'normal' });
    const result = settleNight(state, night);
    // brut = round(100 × 2.14) = 214 ; essence = 2×3×1 = 6 ; restock = round(0.15×324) = 49
    expect(result.essence).toBe(6);
    expect(result.restock).toBe(49);
    expect(result.gross).toBe(214 - 55);
    expect(result.payout).toBe(Math.round(159 * 0.95)); // 151
    expect(state.cash).toBe(151);
  });

  it('ne fait jamais passer la caisse en négatif (banque vide → frais nuls)', () => {
    const state = newGame();
    state.gear.groupe = 3;
    const night = finishedNight(state, { barStock: 'large' }, { bank: 0, peakCrowd: 0, vibeSum: 0 });
    settleNight(state, night);
    expect(state.cash).toBe(0);
  });

  it('prélève aussi sur le demi-brut d’un premier bust', () => {
    const state = newGame();
    state.gear.groupe = 1;
    const night = finishedNight(state, { barStock: 'normal' }, { sunrise: false, busted: true });
    const result = applyBust(state, night);
    // demi-banque = 50, puis essence 6 + restock 44 (restock plafonné à ce qui reste)
    expect(result.essence).toBe(6);
    expect(result.restock).toBe(44);
    expect(result.gross).toBe(0);
    expect(state.cash).toBe(0); // jamais négatif
  });
});

describe('caution du spot (tiers ≥ 3)', () => {
  it('se paie sur la banque et revient à l’aube', () => {
    const state = newGame();
    state.rep = 1000;
    state.cash = 1000;
    expect(cautionCost(state, getSpot('carriere'))).toBe(220); // cap × 1 €
    expect(cautionCost(state, getSpot('champ'))).toBe(0); // tier < 3
    const night = createNight(state, 'carriere', ['tonton'], 4, { caution: true });
    expect(state.cash).toBe(780);
    expect(night.cautionPaid).toBe(220);
    expect(night.heat).toBe(0);
    Object.assign(night, {
      t: 300, phase: 'ended', sunrise: true, bank: 50, peakCrowd: 10,
      vibeSum: 30, vibeSamples: 300,
      playedSets: [{ djId: 'tonton', brief: 'normal' }],
    });
    const result = settleNight(state, night);
    expect(result.cautionReturned).toBe(220);
    expect(state.cash).toBe(780 + result.payout + 220);
  });

  it('est perdue sur bust', () => {
    const state = newGame();
    state.rep = 1000;
    state.cash = 500;
    const night = createNight(state, 'carriere', ['tonton'], 5, { caution: true });
    Object.assign(night, {
      t: 300, phase: 'ended', busted: true, bank: 0, peakCrowd: 0,
      playedSets: [{ djId: 'tonton', brief: 'normal' }],
    });
    const result = applyBust(state, night);
    expect(result.cautionReturned).toBe(0);
    expect(result.cautionPaid).toBe(220);
    expect(state.cash).toBe(280); // la caution ne revient pas
  });

  it('sans caution sur un tier ≥ 3, la heat démarre à +0.1 — jouable quand même', () => {
    const state = newGame();
    state.rep = 1000;
    expect(createNight(state, 'carriere', ['tonton'], 6).heat).toBeCloseTo(0.1, 5);
    expect(createNight(state, 'champ', ['tonton'], 6).heat).toBe(0);
  });

  it('refuse la caution si la banque ne suit pas (et joue sans)', () => {
    const state = newGame();
    state.rep = 1000;
    state.cash = 100;
    const night = createNight(state, 'carriere', ['tonton'], 7, { caution: true });
    expect(night.cautionPaid).toBe(0);
    expect(state.cash).toBe(100);
    expect(night.heat).toBeCloseTo(0.1, 5);
  });
});
```

- [ ] Run it: `npx vitest run test/economy.test.ts` — fails with `Cannot find module '../src/core/economy'`.
- [ ] Create `src/core/economy.ts`:

```ts
import type { Brief, GameState, NightState, SpotDef } from './types';

/** € banked per teufeur per second at the buvette (moved here from night.ts). */
export const BAR_DRIP = 0.05;

export type BarStock = 'leger' | 'normal' | 'large';

/** Fraction of the night's potential bar takings paid up front (on the gross). */
export const BAR_STOCK_COST: Record<BarStock, number> = { leger: 0, normal: 0.15, large: 0.3 };
/** Fraction of the potential bar takings the stock can actually serve. */
export const BAR_STOCK_CAP: Record<BarStock, number> = { leger: 0.5, normal: 0.8, large: 1.1 };

/** €/minute of generator fuel. */
export const ESSENCE_RATE = 2;

/**
 * RÉVISION CHANTIER 1 : l'essence doit pondérer par l'« intensité moyenne »
 * des crans d'intensité. Fallback : la consigne actuelle fait office d'intensité
 * (safe 0.25 / normal 0.5 / pousser 1.0) — à rebrancher sur les crans.
 */
export const BRIEF_INTENSITY: Record<Brief, number> = { safe: 0.25, normal: 0.5, pousser: 1 };

/** Full-crowd bar takings if the floor stayed packed all night. */
export function potentialBar(spot: SpotDef, cap: number): number {
  return cap * BAR_DRIP * spot.priceMult * spot.duration;
}

/** Fuel for the night — free on the tier-0 « groupe poussif » (no-softlock). */
export function essenceCost(state: GameState, night: NightState): number {
  if (state.gear.groupe === 0) return 0;
  if (night.playedSets.length === 0) return 0;
  const avg =
    night.playedSets.reduce((sum, s) => sum + BRIEF_INTENSITY[s.brief], 0) / night.playedSets.length;
  return Math.round(ESSENCE_RATE * (night.t / 60) * (0.5 + avg));
}

/** Spot deposit: cap × 1 €, tiers ≥ 3 only. Paid from the bank, by choice. */
export function cautionCost(_state: GameState, spot: SpotDef): number {
  if (spot.tier < 3) return 0;
  return Math.round(spot.cap);
}

/** Bar restock fee for the chosen stock level, charged on the gross. */
export function restockCost(spot: SpotDef, cap: number, barStock: BarStock): number {
  return Math.round(BAR_STOCK_COST[barStock] * potentialBar(spot, cap));
}
```

- [ ] In `src/core/types.ts` add to `NightState` (after `bank: number;`):

```ts
  /** stock du bar choisi à la prépa — plafonne la recette buvette */
  barStock: 'leger' | 'normal' | 'large';
  /** plafond de vente buvette (en €) imposé par le stock */
  barCap: number;
  /** ventes buvette cumulées (seule la buvette est plafonnée, pas les events) */
  barSales: number;
  /** caution versée au lancement (0 si aucune) — rendue à l'aube, perdue sur bust */
  cautionPaid: number;
```

and to `NightResult` (after `fine: number;`):

```ts
  /** essence du groupe, prélevée sur le brut */
  essence: number;
  /** restock du bar, prélevé sur le brut */
  restock: number;
  /** caution versée au lancement */
  cautionPaid: number;
  /** caution rendue à l'aube (0 sur bust ou sans caution) */
  cautionReturned: number;
```

- [ ] In `src/core/night.ts`:
  - delete `const BAR_DRIP = 0.05;` and import instead: `import { BAR_DRIP, BAR_STOCK_CAP, cautionCost, potentialBar, type BarStock } from './economy';`
  - change the signature of `createNight` and seed the new fields:

```ts
export interface NightOptions {
  barStock?: BarStock;
  caution?: boolean;
}

export function createNight(
  state: GameState,
  spotId: SpotId,
  presentDjs: string[],
  seed: number,
  opts: NightOptions = {},
): NightState {
  const spot = getSpot(spotId);
  const murItem = GEAR.mur[state.gear.mur];
  const murMult = murItem.value * (state.damaged.mur ? 0.6 : 1);
  const cap = Math.round(spot.cap * murMult);
  const barStock: BarStock = opts.barStock ?? 'leger';
  // caution : un choix d'ambition payé sur la banque ; sans elle, heat de départ +0.1
  let cautionPaid = 0;
  if (opts.caution && spot.tier >= 3) {
    const cost = cautionCost(state, spot);
    if (state.cash >= cost) {
      state.cash -= cost;
      cautionPaid = cost;
    }
  }
  const startHeat = spot.tier >= 3 && cautionPaid === 0 ? 0.1 : 0;
  // modifs du soir (météo/foule) — flux RNG dédié, ne perturbe pas le flux des events
  const modifiers = rollModifiers(spot.tier, seed);
  const eventDelay = modifierSum(modifiers, 'eventDelay');
  return {
    ...
    cap,
    ...
    heat: startHeat,
    peakHeat: startHeat,
    bank: 0,
    barStock,
    barCap: BAR_STOCK_CAP[barStock] * potentialBar(spot, cap),
    barSales: 0,
    cautionPaid,
    ...
  };
}
```

  (keep every other literal field exactly as today — only `cap` becomes the precomputed const, `heat`/`peakHeat` use `startHeat`, and the four new fields are inserted after `bank: 0,`.)
  - replace the bar-drip line in `tickNight`:

```ts
  // --- bar drip — plafonné par le stock embarqué -------------------------------------
  const drip = night.crowd * BAR_DRIP * spot.priceMult * priceMod * dt;
  const sold = Math.min(drip, Math.max(0, night.barCap - night.barSales));
  night.barSales += sold;
  night.bank += sold;
```

- [ ] In `src/core/payout.ts`:
  - import: `import { essenceCost, restockCost } from './economy';`
  - in `settleNight`, replace the gross/payout block:

```ts
  const vibe = avgVibe(night);
  const donationMult = 1 + 0.8 * vibe + 0.6 * (night.peakCrowd / night.cap);
  const grossRaw = Math.round(night.bank * donationMult);
  // frais de nuit : prélevés sur le brut, jamais sur la banque (no-softlock)
  const spot = getSpot(night.spotId);
  const essence = Math.min(grossRaw, essenceCost(state, night));
  const restock = Math.min(grossRaw - essence, restockCost(spot, night.cap, night.barStock));
  const gross = grossRaw - essence - restock;
  const cuts = cutsTotal(night);
  const payout = Math.round(gross * (1 - cuts));
  ...
  state.cash += payout + night.cautionPaid; // caution rendue à l'aube
```

  (add `getSpot` usage — it is already imported) and extend the result literal:

```ts
    gross,
    cutsTotal: cuts,
    payout,
    fine: 0,
    essence,
    restock,
    cautionPaid: night.cautionPaid,
    cautionReturned: night.cautionPaid,
    seized: null,
```

  - in `applyBust`, charge the fees on whatever gross survives and burn the caution:

```ts
  let gross = 0;
  let fine = 0;
  let seized: GearCategory | null = null;

  if (offense === 1) {
    gross = Math.round(night.bank * 0.5);
  } else if (offense === 2) {
    fine = 200 * spot.tier;
  } else {
    fine = 200 * spot.tier;
    seized = bestSeizable(state);
    if (seized) state.gear[seized] = Math.max(0, state.gear[seized] - 1);
  }

  // les frais ne touchent jamais la banque : plafonnés à ce que la nuit a rapporté
  const essence = Math.min(gross, essenceCost(state, night));
  const restock = Math.min(gross - essence, restockCost(spot, night.cap, night.barStock));
  gross -= essence + restock;
```

  and in its result literal add `essence, restock, cautionPaid: night.cautionPaid, cautionReturned: 0,` (the caution is simply never refunded — it left the bank in `createNight`).
- [ ] Run `npx vitest run test/economy.test.ts` — green. Then the whole suite: `npm run test && npm run build`. Existing expectations survive because the default `barStock` is `'leger'` (0 € / cap 162 € on champ, above any simulated champ bank ≈ 130 €) and the starter `groupe` is tier 0 (essence free). If `modifiers.test.ts` or `night.test.ts` assert bank amounts on bigger spots that now hit the cap, raise the test's stock to `'large'` via the new opts — but none should.
- [ ] Commit: `git add -A && git commit -m "feat(core): frais de nuit sur le brut — essence, stock du bar, caution"`

---

### Task 2: UI prépa & recap des frais de nuit

**Files:**
- Modify: `src/ui/strings.ts`
- Modify: `src/ui/screens.ts` (PrepareSelection, fees panel, recap lines)
- Modify: `src/main.ts` (selection init, createNight opts)
- Test: `npm run test && npm run build` (screens layer has no DOM test harness in this repo — tsc + manual smoke)

- [ ] In `src/ui/strings.ts`, add after the `gearEffect` block:

```ts
  // frais de nuit
  nightCosts: 'Les frais de la nuit',
  barStockLabel: 'Stock du bar',
  barStock: { leger: 'Léger', normal: 'Normal', large: 'Large' } as const,
  barStockHint: {
    leger: 'Gratuit — la buvette sature à ~50 % de son potentiel',
    normal: '15 % de la recette potentielle — couvre ~80 % de la jauge',
    large: '30 % — large, pour les nuits de folie (110 %)',
  } as const,
  cautionBtn: (cost: number, on: boolean) =>
    on ? `✓ Caution payée — ${cost} €` : `Payer la caution — ${cost} €`,
  cautionHint: 'Rendue à l’aube si pas de bust, perdue sinon. Sans caution : les bleus partent avec une longueur d’avance.',
  feesEstimate: (n: number) => `Frais estimés sur le brut : ~${n} €`,
```

and in the recap section (after `bustCut`):

```ts
  essenceLine: 'Essence du groupe',
  restockLine: 'Stock du bar',
  cautionReturnedLine: 'Caution rendue',
  cautionLostLine: 'Caution perdue',
```

- [ ] In `src/ui/screens.ts`:
  - extend the imports: `import { BAR_STOCK_COST, ESSENCE_RATE, cautionCost, potentialBar, type BarStock } from '../core/economy';`
  - extend `PrepareSelection`:

```ts
export interface PrepareSelection {
  spot: SpotId;
  present: Set<string>;
  barStock: BarStock;
  caution: boolean;
}
```

  - in `renderPrepare`, after the spot-cards loop (before `main.append(where);`), add the fees panel:

```ts
  // --- frais de nuit : stock du bar + caution
  const fees = el('div', 'night-fees');
  fees.append(el('h2', '', STR.nightCosts));
  fees.append(el('div', 'card-meta', STR.barStockLabel));
  const stockRow = el('div', 'stock-row');
  for (const stock of ['leger', 'normal', 'large'] as BarStock[]) {
    const b = el('button', `btn small${selection.barStock === stock ? ' selected' : ''}`, STR.barStock[stock]);
    b.title = STR.barStockHint[stock];
    b.addEventListener('click', () => {
      selection.barStock = stock;
      renderPrepare(root, state, selection, now, cb);
    });
    stockRow.append(b);
  }
  fees.append(stockRow);
  const spotDef = getSpot(selection.spot);
  if (spotDef.tier >= 3) {
    const cost = cautionCost(state, spotDef);
    const cBtn = el('button', `btn small${selection.caution ? ' selected' : ''}`, STR.cautionBtn(cost, selection.caution));
    cBtn.title = STR.cautionHint;
    cBtn.disabled = !selection.caution && state.cash < cost;
    cBtn.addEventListener('click', () => {
      selection.caution = !selection.caution;
      renderPrepare(root, state, selection, now, cb);
    });
    fees.append(cBtn);
  }
  const estCap = Math.round(spotDef.cap * GEAR.mur[state.gear.mur].value);
  const estRestock = Math.round(BAR_STOCK_COST[selection.barStock] * potentialBar(spotDef, estCap));
  const estEssence = state.gear.groupe === 0 ? 0 : Math.round(ESSENCE_RATE * (spotDef.duration / 60) * 1);
  fees.append(el('p', 'hint', STR.feesEstimate(estRestock + estEssence)));
  where.append(fees);
```

  - in `renderRecap`, right after the `barTotal` line, add the fee lines:

```ts
  if (result.essence > 0) lines.append(recapLine(`⛽ ${STR.essenceLine}`, `−${fmtCash(result.essence)}`));
  if (result.restock > 0) lines.append(recapLine(`🍺 ${STR.restockLine}`, `−${fmtCash(result.restock)}`));
  if (result.cautionReturned > 0) {
    lines.append(recapLine(`🤝 ${STR.cautionReturnedLine}`, `+${fmtCash(result.cautionReturned)}`));
  } else if (result.busted && result.cautionPaid > 0) {
    lines.append(recapLine(`🤝 ${STR.cautionLostLine}`, `−${fmtCash(result.cautionPaid)}`));
  }
```

- [ ] In `src/main.ts`:
  - selection init becomes:

```ts
const selection: PrepareSelection = {
  spot: 'champ',
  present: new Set(state.crew.map((d) => d.id)),
  barStock: 'normal',
  caution: false,
};
```

  - in `startNight`, pass the options:

```ts
  const night = createNight(state, selection.spot, present, (Date.now() ^ 0x7e7) >>> 0, {
    barStock: selection.barStock,
    caution: selection.caution,
  });
```

  - in `showPrepare`, after the spot-fallback line, reset an unaffordable caution: `if (selection.caution && state.cash < cautionCost(state, getSpot(selection.spot))) selection.caution = false;` (import `cautionCost` from `../core/economy`).
- [ ] Add minimal CSS in `src/style.css` (append at the end):

```css
.night-fees { margin-top: 12px; }
.night-fees .stock-row { display: flex; gap: 6px; margin: 6px 0; }
.crew-sinks { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
```

- [ ] `npm run test && npm run build` — green. Manual smoke: `npm run dev`, check the prépa shows the 3 stock buttons, the caution button on Carrière+, and a recap shows fee lines after a non-champ night.
- [ ] Commit: `git add -A && git commit -m "feat(ui): la prépa affiche et choisit les frais de nuit"`

---

### Task 3: Le matos branche au tier 3 — voies A/B, prix ×2.5, tiers 4–5

**Files:**
- Modify: `src/core/types.ts` (GearBranch, GearEffects, GearItem.branch/effects, GameState.gearBranch)
- Modify: `src/core/data.ts` (GEAR rebuild + selectors)
- Modify: `src/core/payout.ts` (buyGearUpgrade branch, switchGearBranch, bestSeizable)
- Modify: `src/core/night.ts`, `src/core/idle.ts`, `src/ui/screens.ts` (call sites)
- Modify: `src/core/save.ts` (newGame + SAVE_VERSION 3 + migration)
- Modify: `test/data.test.ts`, `src/core/progression.test.ts`, `test/save.test.ts`
- Test: append to `test/economy.test.ts`

- [ ] Append the failing tests to `test/economy.test.ts`:

```ts
import { BRANCH_TIER, GEAR, GEAR_CATEGORIES, gearItem, nextGearOptions, ownedGear, switchBranchItem } from '../src/core/data';
import { buyGearUpgrade, switchGearBranch } from '../src/core/payout';

describe('branches du matos', () => {
  it('refuse le tier 3 sans choix de voie, puis verrouille la voie choisie', () => {
    const state = newGame();
    state.cash = 100000;
    expect(buyGearUpgrade(state, 'platines')).toBe(true); // t1 — 500 €
    expect(buyGearUpgrade(state, 'platines')).toBe(true); // t2 — 2 500 €
    expect(buyGearUpgrade(state, 'platines')).toBe(false); // t3 exige une voie
    expect(buyGearUpgrade(state, 'platines', 'A')).toBe(true); // t3A — 7 000 €
    expect(state.gearBranch.platines).toBe('A');
    expect(state.cash).toBe(100000 - 500 - 2500 - 7000);
    // les tiers 4–5 prolongent la voie sans re-choisir
    expect(buyGearUpgrade(state, 'platines')).toBe(true); // t4A — 4 000 €
    expect(ownedGear(state, 'platines').branch).toBe('A');
    expect(ownedGear(state, 'platines').tier).toBe(4);
  });

  it('changer de voie = racheter le tier courant au prix plein', () => {
    const state = newGame();
    state.cash = 100000;
    state.gear.platines = 4;
    state.gearBranch.platines = 'A';
    const other = switchBranchItem(state, 'platines')!;
    expect(other.branch).toBe('B');
    expect(other.price).toBe(4000);
    expect(switchGearBranch(state, 'platines')).toBe(true);
    expect(state.cash).toBe(100000 - 4000);
    expect(state.gearBranch.platines).toBe('B');
    expect(ownedGear(state, 'platines').nom).toBe(gearItem('platines', 4, 'B').nom);
  });

  it('propose deux options au tier 3, une seule ensuite', () => {
    const state = newGame();
    state.gear.mur = 2;
    expect(nextGearOptions(state, 'mur').map((g) => g.branch)).toEqual(['A', 'B']);
    state.gear.mur = 3;
    state.gearBranch.mur = 'B';
    expect(nextGearOptions(state, 'mur').map((g) => `${g.tier}${g.branch}`)).toEqual(['4B']);
    state.gear.mur = 5;
    expect(nextGearOptions(state, 'mur')).toEqual([]);
  });

  it('chaque catégorie a 9 items : t0–t2 sans voie, t3–t5 en double', () => {
    for (const cat of GEAR_CATEGORIES) {
      expect(GEAR[cat]).toHaveLength(9);
      expect(GEAR[cat].filter((g) => g.branch === undefined).map((g) => g.tier)).toEqual([0, 1, 2]);
      for (const tier of [3, 4, 5]) {
        expect(GEAR[cat].filter((g) => g.tier === tier).map((g) => g.branch).sort()).toEqual(['A', 'B']);
      }
      expect(GEAR[cat][0].price).toBe(0);
      expect(GEAR[cat][0].seizable).toBe(false);
    }
    expect(BRANCH_TIER).toBe(3);
  });
});
```

- [ ] Run: `npx vitest run test/economy.test.ts` — fails (`gearItem`/`BRANCH_TIER`… not exported).
- [ ] In `src/core/types.ts`:

```ts
export type GearBranch = 'A' | 'B';

/** Branch perks mapped onto existing sim levers (see night.ts). */
export interface GearEffects {
  /** platines B — charisme effectif +1 pour tous les DJs */
  charismeBonus?: number;
  /** mur A / lumières A — la foule reste (multiplie le churn) */
  churnMult?: number;
  /** mur B / groupe A — le son porte moins loin (multiplie la heat) */
  heatMult?: number;
  /** mur B — line array : bonus de qualité de set */
  qualityMult?: number;
  /** groupe B — pousser le son ne surcharge plus le groupe.
   *  RÉVISION CHANTIER 1 : devient « RINSE sans surcharge » avec les crans. */
  pousserPowerFree?: boolean;
  /** lumières B — payoff du drop multiplié */
  dropMult?: number;
  /** logistique B — cautions multipliées (< 1 = réduction) */
  cautionMult?: number;
}
```

  change `GearItem`:

```ts
export interface GearItem {
  category: GearCategory;
  tier: number;
  /** voie exclusive à partir du tier 3 ('A' | 'B'), absente avant */
  branch?: GearBranch;
  nom: string;
  price: number;
  /** category-specific magnitude (see data.ts for semantics) */
  value: number;
  seizable: boolean;
  /** leviers de voie additionnels (voir GearEffects) */
  effects?: GearEffects;
}
```

  and add to `GameState` after `gear`:

```ts
  /** voie choisie par catégorie une fois le tier 3 acheté */
  gearBranch: Partial<Record<GearCategory, GearBranch>>;
```

- [ ] In `src/core/data.ts`, replace the whole `GEAR` constant (prices t1–t3 ×2.5; t4 = 4 000 €, t5 = 10 000 €; spec table §2 for the two voies). Doc comment update: keep the per-category `value` semantics block and add `branch effects are typed in GearEffects`.

```ts
export const GEAR: Record<GearCategory, GearItem[]> = {
  platines: [
    { category: 'platines', tier: 0, nom: 'Platines de récup', price: 0, value: 0.85, seizable: false },
    { category: 'platines', tier: 1, nom: 'Contrôleur d’occase', price: 500, value: 1.0, seizable: true },
    { category: 'platines', tier: 2, nom: 'Setup pro', price: 2500, value: 1.12, seizable: true },
    // voie A — Précision : la qualité avant tout
    { category: 'platines', tier: 3, branch: 'A', nom: 'Cabine de légende', price: 7000, value: 1.3, seizable: true },
    { category: 'platines', tier: 4, branch: 'A', nom: 'Régie chirurgicale', price: 4000, value: 1.38, seizable: true },
    { category: 'platines', tier: 5, branch: 'A', nom: 'Laboratoire du son', price: 10000, value: 1.5, seizable: true },
    // voie B — Showmanship : le charisme effectif de tout le crew +1
    { category: 'platines', tier: 3, branch: 'B', nom: 'Cabine spectacle', price: 7000, value: 1.2, seizable: true, effects: { charismeBonus: 1 } },
    { category: 'platines', tier: 4, branch: 'B', nom: 'Scène à paillettes', price: 4000, value: 1.26, seizable: true, effects: { charismeBonus: 1 } },
    { category: 'platines', tier: 5, branch: 'B', nom: 'Cathédrale du show', price: 10000, value: 1.32, seizable: true, effects: { charismeBonus: 1 } },
  ],
  mur: [
    { category: 'mur', tier: 0, nom: 'Les vieilles enceintes du camion', price: 0, value: 0.6, seizable: false },
    { category: 'mur', tier: 1, nom: 'Stack honnête', price: 625, value: 1.0, seizable: true },
    { category: 'mur', tier: 2, nom: 'Gros système', price: 3000, value: 1.45, seizable: true },
    // voie A — Infrabasses : cap ++, la foule reste collée au mur
    { category: 'mur', tier: 3, branch: 'A', nom: 'Mur de son', price: 7500, value: 2.0, seizable: true, effects: { churnMult: 0.88 } },
    { category: 'mur', tier: 4, branch: 'A', nom: 'Mur d’infrabasses', price: 4000, value: 2.4, seizable: true, effects: { churnMult: 0.82 } },
    { category: 'mur', tier: 5, branch: 'A', nom: 'Cité du caisson', price: 10000, value: 2.9, seizable: true, effects: { churnMult: 0.75 } },
    // voie B — Line array : qualité +, le son porte moins → heat −
    { category: 'mur', tier: 3, branch: 'B', nom: 'Line array', price: 7500, value: 1.85, seizable: true, effects: { qualityMult: 1.06, heatMult: 0.92 } },
    { category: 'mur', tier: 4, branch: 'B', nom: 'Line array V2', price: 4000, value: 2.1, seizable: true, effects: { qualityMult: 1.09, heatMult: 0.88 } },
    { category: 'mur', tier: 5, branch: 'B', nom: 'Arc de son', price: 10000, value: 2.5, seizable: true, effects: { qualityMult: 1.12, heatMult: 0.84 } },
  ],
  groupe: [
    { category: 'groupe', tier: 0, nom: 'Groupe poussif', price: 0, value: 0.62, seizable: false },
    { category: 'groupe', tier: 1, nom: 'Groupe de chantier', price: 450, value: 0.8, seizable: true },
    { category: 'groupe', tier: 2, nom: 'Groupe insonorisé', price: 2250, value: 0.95, seizable: true },
    // voie A — Silencieux : heat −, power honnête
    { category: 'groupe', tier: 3, branch: 'A', nom: 'Semi silencieux', price: 6250, value: 1.2, seizable: true, effects: { heatMult: 0.9 } },
    { category: 'groupe', tier: 4, branch: 'A', nom: 'Caisson furtif', price: 4000, value: 1.32, seizable: true, effects: { heatMult: 0.85 } },
    { category: 'groupe', tier: 5, branch: 'A', nom: 'Centrale fantôme', price: 10000, value: 1.45, seizable: true, effects: { heatMult: 0.8 } },
    // voie B — Monstre : power ++, pousser sans surcharge (RÉVISION CHANTIER 1 : RINSE)
    { category: 'groupe', tier: 3, branch: 'B', nom: 'Semi monstre', price: 6250, value: 1.35, seizable: true },
    { category: 'groupe', tier: 4, branch: 'B', nom: 'Turbine de chantier', price: 4000, value: 1.55, seizable: true, effects: { pousserPowerFree: true } },
    { category: 'groupe', tier: 5, branch: 'B', nom: 'Réacteur du teknival', price: 10000, value: 1.85, seizable: true, effects: { pousserPowerFree: true } },
  ],
  lumieres: [
    { category: 'lumieres', tier: 0, nom: 'Trois ampoules', price: 0, value: 0, seizable: false },
    { category: 'lumieres', tier: 1, nom: 'Barre de LEDs', price: 300, value: 0.06, seizable: true },
    { category: 'lumieres', tier: 2, nom: 'Lasers + stroboscope', price: 2000, value: 0.12, seizable: true },
    // voie A — Hypnose : vibe +, la foule décroche moins
    // RÉVISION CHANTIER 1 : « burnout de foule ralenti » → fallback churnMult
    { category: 'lumieres', tier: 3, branch: 'A', nom: 'Show hypnose', price: 5500, value: 0.24, seizable: true, effects: { churnMult: 0.9 } },
    { category: 'lumieres', tier: 4, branch: 'A', nom: 'Spirale de lasers', price: 4000, value: 0.28, seizable: true, effects: { churnMult: 0.85 } },
    { category: 'lumieres', tier: 5, branch: 'A', nom: 'Aurore artificielle', price: 10000, value: 0.32, seizable: true, effects: { churnMult: 0.8 } },
    // voie B — Stroboscopique : le drop paie plus
    { category: 'lumieres', tier: 3, branch: 'B', nom: 'Mur de strobes', price: 5500, value: 0.2, seizable: true, effects: { dropMult: 1.25 } },
    { category: 'lumieres', tier: 4, branch: 'B', nom: 'Tempête blanche', price: 4000, value: 0.22, seizable: true, effects: { dropMult: 1.5 } },
    { category: 'lumieres', tier: 5, branch: 'B', nom: 'Éclipse stroboscopique', price: 10000, value: 0.25, seizable: true, effects: { dropMult: 1.8 } },
  ],
  logistique: [
    { category: 'logistique', tier: 0, nom: 'Personne au portail', price: 0, value: 1.0, seizable: false },
    { category: 'logistique', tier: 1, nom: 'Deux guetteurs', price: 450, value: 0.85, seizable: true },
    { category: 'logistique', tier: 2, nom: 'Talkies + spots de repli', price: 2250, value: 0.7, seizable: true },
    // voie A — Réseau : la chaleur monte encore moins
    // RÉVISION CHANTIER 1 : « descente retardée, négo + » → fallback value (heat) plus bas
    { category: 'logistique', tier: 3, branch: 'A', nom: 'Réseau de la scène', price: 6000, value: 0.55, seizable: true },
    { category: 'logistique', tier: 4, branch: 'A', nom: 'Toile d’indics', price: 4000, value: 0.48, seizable: true },
    { category: 'logistique', tier: 5, branch: 'A', nom: 'La scène entière', price: 10000, value: 0.4, seizable: true },
    // voie B — Mobilité : cautions −50 %
    // RÉVISION CHANTIER 1 : « évacuation sans malus de rep » à brancher sur la descente
    { category: 'logistique', tier: 3, branch: 'B', nom: 'Convoi mobile', price: 6000, value: 0.6, seizable: true, effects: { cautionMult: 0.5 } },
    { category: 'logistique', tier: 4, branch: 'B', nom: 'Caravane éclair', price: 4000, value: 0.55, seizable: true, effects: { cautionMult: 0.5 } },
    { category: 'logistique', tier: 5, branch: 'B', nom: 'Flotte insaisissable', price: 10000, value: 0.48, seizable: true, effects: { cautionMult: 0.35 } },
  ],
};
```

- [ ] Still in `src/core/data.ts`, add the selectors (and `import type { GameState, GearBranch }` from `./types`):

```ts
/** Le matos branche à partir de ce tier — la voie se choisit à l'achat. */
export const BRANCH_TIER = 3;

export function gearItem(cat: GearCategory, tier: number, branch?: GearBranch): GearItem {
  const item = GEAR[cat].find(
    (g) => g.tier === tier && (tier < BRANCH_TIER || g.branch === branch),
  );
  if (!item) throw new Error(`unknown gear: ${cat} t${tier} ${branch ?? ''}`);
  return item;
}

/** L'item possédé d'une catégorie (tier + voie choisie). */
export function ownedGear(state: GameState, cat: GearCategory): GearItem {
  return gearItem(cat, state.gear[cat], state.gearBranch[cat]);
}

/** Prochains achats : deux options au passage du tier 3, une seule ensuite. */
export function nextGearOptions(state: GameState, cat: GearCategory): GearItem[] {
  const nextTier = state.gear[cat] + 1;
  if (nextTier < BRANCH_TIER) return GEAR[cat].filter((g) => g.tier === nextTier);
  if (nextTier === BRANCH_TIER) {
    return ['A', 'B'].map((b) => gearItem(cat, BRANCH_TIER, b as GearBranch));
  }
  const branch = state.gearBranch[cat];
  return GEAR[cat].filter((g) => g.tier === nextTier && g.branch === branch);
}

/** L'item miroir de la voie non choisie au tier courant, ou null avant le tier 3. */
export function switchBranchItem(state: GameState, cat: GearCategory): GearItem | null {
  const tier = state.gear[cat];
  const branch = state.gearBranch[cat];
  if (tier < BRANCH_TIER || !branch) return null;
  return gearItem(cat, tier, branch === 'A' ? 'B' : 'A');
}
```

- [ ] In `src/core/payout.ts`, rewire and extend (import `BRANCH_TIER, ownedGear, switchBranchItem` from `./data`, `GearBranch` + `GearItem` types from `./types`):

```ts
function bestSeizable(state: GameState): GearCategory | null {
  let best: GearCategory | null = null;
  let bestValue = -1;
  for (const cat of GEAR_CATEGORIES) {
    const item = ownedGear(state, cat);
    if (item.seizable && item.price > bestValue) {
      best = cat;
      bestValue = item.price;
    }
  }
  return best;
}

export function buyGearUpgrade(state: GameState, cat: GearCategory, branch?: GearBranch): boolean {
  const nextTier = state.gear[cat] + 1;
  let next: GearItem | undefined;
  if (nextTier < BRANCH_TIER) {
    next = GEAR[cat].find((g) => g.tier === nextTier);
  } else if (nextTier === BRANCH_TIER) {
    if (!branch) return false; // le tier 3 exige un choix de voie
    next = GEAR[cat].find((g) => g.tier === nextTier && g.branch === branch);
  } else {
    const chosen = state.gearBranch[cat];
    next = GEAR[cat].find((g) => g.tier === nextTier && g.branch === chosen);
  }
  if (!next || state.cash < next.price) return false;
  state.cash -= next.price;
  state.gear[cat] = nextTier;
  if (nextTier === BRANCH_TIER) state.gearBranch[cat] = branch;
  return true;
}

/** Changer de voie : racheter l'item miroir du tier courant au prix plein. */
export function switchGearBranch(state: GameState, cat: GearCategory): boolean {
  const target = switchBranchItem(state, cat);
  if (!target || state.cash < target.price) return false;
  state.cash -= target.price;
  state.gearBranch[cat] = target.branch;
  return true;
}
```

  (add `GearItem` to the type imports.)
- [ ] Rewire every `GEAR[cat][state.gear[cat]]`-style lookup to `ownedGear` (import it in each file):
  - `src/core/night.ts` — in `createNight`: `const murItem = ownedGear(state, 'mur');` · in `computeSetQuality`: `const platines = ownedGear(state, 'platines').value * (...);` · in `tickNight`: `const groupeItem = ownedGear(state, 'groupe');`, `const lumieres = ownedGear(state, 'lumieres').value;`, `const logistique = ownedGear(state, 'logistique').value;`
  - `src/core/idle.ts` — `gearName`: `return ownedGear(state, cat).nom;`
  - `src/ui/screens.ts` — gear column: `const current = ownedGear(state, cat);` and replace `const next = GEAR[cat][tier + 1];` with `const next = nextGearOptions(state, cat)[0];` (temporary single-option button; Task 5 builds the real branch UI). Remove the now-unused `tier` local if tsc flags it. Also rewire the fees-estimate line added in Task 2: `const estCap = Math.round(spotDef.cap * GEAR.mur[state.gear.mur].value);` → `const estCap = Math.round(spotDef.cap * ownedGear(state, 'mur').value);` (index lookups still compile against the 9-item arrays but silently read the voie A item).
- [ ] In `src/core/save.ts`:
  - `export const SAVE_VERSION = 3;`
  - `newGame` gains `gearBranch: {},` right after `gear: {...},`
  - migration before validation:

```ts
import type { GameState, GearBranch, GearCategory } from './types';

/** v2 → v3 : les branches du matos n'existaient pas — voie A par défaut au tier ≥ 3. */
function migrateV2(o: Record<string, unknown>): void {
  if (o.version !== 2) return;
  o.version = 3;
  const gear = (o.gear ?? {}) as Record<GearCategory, number>;
  const gearBranch: Partial<Record<GearCategory, GearBranch>> = {};
  for (const cat of Object.keys(gear) as GearCategory[]) {
    if (gear[cat] >= 3) gearBranch[cat] = 'A';
  }
  o.gearBranch = gearBranch;
}

export function deserialize(json: string): GameState | null {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') migrateV2(parsed);
    return isValidState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
```

  and extend `isValidState` with `typeof o.gearBranch === 'object' && o.gearBranch !== null &&`.
- [ ] Append the migration test to `test/save.test.ts`:

```ts
describe('migration v2 → v3', () => {
  it('charge une vieille sauvegarde : gearBranch ajouté, voie A par défaut au tier 3', () => {
    const v2 = { ...newGame(), version: 2 } as unknown as Record<string, unknown>;
    delete v2.gearBranch;
    v2.gear = { platines: 3, mur: 1, groupe: 0, lumieres: 0, logistique: 0 };
    const loaded = deserialize(JSON.stringify(v2));
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.gearBranch.platines).toBe('A');
    expect(loaded!.gearBranch.mur).toBeUndefined();
  });
});
```

- [ ] Update `test/data.test.ts` — replace the whole `describe('gear', ...)` block:

```ts
describe('gear', () => {
  it('has five categories, each with an unseizable free tier 0', () => {
    expect(GEAR_CATEGORIES).toEqual(['platines', 'mur', 'groupe', 'lumieres', 'logistique']);
    for (const cat of GEAR_CATEGORIES) {
      expect(GEAR[cat]).toHaveLength(9); // t0–t2 + t3/t4/t5 × deux voies
      expect(GEAR[cat][0].seizable).toBe(false);
      expect(GEAR[cat][0].price).toBe(0);
      // les tiers 1–3 grimpent ; le t4 (4 000 €) redescend sous le t3 par design (spec §2)
      const baseline = GEAR[cat].filter((g) => g.branch === undefined).map((g) => g.price);
      expect([...baseline].sort((a, b) => a - b)).toEqual(baseline);
    }
  });

  it('makes logistique reduce heat with higher tiers along each voie', () => {
    for (const branch of ['A', 'B'] as const) {
      const path = GEAR.logistique
        .filter((g) => g.branch === undefined || g.branch === branch)
        .map((g) => g.value);
      expect([...path].sort((a, b) => b - a)).toEqual(path);
    }
  });
});
```

- [ ] Update `src/core/progression.test.ts` — the first purchase now needs two nights (prices ×2.5; spec §2 « la première heure ralentit, sans changer l'ordre des achats »). Replace the first test:

```ts
  it('two nights fund a first purchase (prix ×2.5 — la première heure ralentit)', () => {
    const state = newGame(42);
    playNight(state, 1);
    playNight(state, 2);
    // cheapest tier-1 = Barre de LEDs 300 € ; mesuré ≈ 492 € après 2 nuits
    const cheapest = Math.min(
      ...Object.values(GEAR).map((items) => items[1].price),
    );
    expect(state.cash).toBeGreaterThanOrEqual(cheapest);
  });
```

- [ ] `npm run test && npm run build` — all green (the harness change above is the only balance-sensitive expectation: prices ×2.5 with measured night payouts ≈ 185–254 €).
- [ ] Commit: `git add -A && git commit -m "feat(core): le matos branche au tier 3 — voies A/B, prix ×2.5, tiers 4–5"`

---

### Task 4: Les voies pèsent sur la sim — charisme, churn, heat, qualité, power, drop, caution

**Files:**
- Modify: `src/core/night.ts` (effect application + exported helpers, dropMontee signature)
- Modify: `src/core/economy.ts` (cautionMult)
- Modify: `src/core/live.test.ts`, `src/main.ts` (dropMontee call sites)
- Test: append to `test/economy.test.ts`

- [ ] Append the failing tests to `test/economy.test.ts`:

```ts
import {
  branchChurnMult,
  branchHeatMult,
  computeSetQuality,
  createNight as mkNight,
  dropMontee,
  effectiveCharisme,
  startSet as start,
} from '../src/core/night';
import { getDj } from '../src/core/data';

describe('les voies dans la sim', () => {
  it('platines B : charisme effectif +1 pour tous les DJs', () => {
    const state = newGame();
    expect(effectiveCharisme(state, getDj('tonton'))).toBe(2);
    state.gear.platines = 3;
    state.gearBranch.platines = 'B';
    expect(effectiveCharisme(state, getDj('tonton'))).toBe(3);
    state.gearBranch.platines = 'A';
    expect(effectiveCharisme(state, getDj('tonton'))).toBe(2);
  });

  it('mur A + lumières A : le churn se multiplie', () => {
    const state = newGame();
    expect(branchChurnMult(state)).toBe(1);
    state.gear.mur = 3;
    state.gearBranch.mur = 'A';
    state.gear.lumieres = 3;
    state.gearBranch.lumieres = 'A';
    expect(branchChurnMult(state)).toBeCloseTo(0.88 * 0.9, 5);
  });

  it('mur B + groupe A : la heat se multiplie', () => {
    const state = newGame();
    expect(branchHeatMult(state)).toBe(1);
    state.gear.mur = 3;
    state.gearBranch.mur = 'B';
    state.gear.groupe = 3;
    state.gearBranch.groupe = 'A';
    expect(branchHeatMult(state)).toBeCloseTo(0.92 * 0.9, 5);
  });

  it('mur B : le line array bonifie la qualité de set', () => {
    const a = newGame();
    a.gear.mur = 3;
    a.gearBranch.mur = 'A';
    const b = newGame();
    b.gear.mur = 3;
    b.gearBranch.mur = 'B';
    const na = mkNight(a, 'champ', ['tonton'], 8);
    const nb = mkNight(b, 'champ', ['tonton'], 8);
    expect(computeSetQuality(b, nb, 'tonton', 'normal')).toBeCloseTo(
      computeSetQuality(a, na, 'tonton', 'normal') * 1.06,
      5,
    );
  });

  it('lumières B : le drop paie plus', () => {
    const mk = (branch: 'A' | 'B') => {
      const state = newGame();
      state.gear.lumieres = 3;
      state.gearBranch.lumieres = branch;
      const night = mkNight(state, 'champ', ['tonton'], 9);
      start(state, night, 'tonton', 'normal');
      night.montee = 1;
      night.vibe = 0.3;
      night.crowd = night.cap * 0.3;
      dropMontee(state, night);
      return night;
    };
    expect(mk('B').vibe).toBeGreaterThan(mk('A').vibe);
    expect(mk('B').crowd).toBeGreaterThan(mk('A').crowd);
  });

  it('logistique B : cautions −50 %', () => {
    const state = newGame();
    state.gear.logistique = 3;
    state.gearBranch.logistique = 'B';
    expect(cautionCost(state, getSpot('carriere'))).toBe(110);
  });
});
```

- [ ] Run: `npx vitest run test/economy.test.ts` — fails (helpers missing, `dropMontee` arity).
- [ ] In `src/core/night.ts` add the pure helpers (export them) and wire them into `tickNight`:

```ts
/** Charisme effectif : la voie Showmanship des platines profite à tout le crew. */
export function effectiveCharisme(state: GameState, dj: DjDef | null): number {
  const base = dj ? dj.charisme : 2;
  return base + (ownedGear(state, 'platines').effects?.charismeBonus ?? 0);
}

/** Produit des churnMult de voie (mur Infrabasses, lumières Hypnose). */
export function branchChurnMult(state: GameState): number {
  return (
    (ownedGear(state, 'mur').effects?.churnMult ?? 1) *
    (ownedGear(state, 'lumieres').effects?.churnMult ?? 1)
  );
}

/** Produit des heatMult de voie (mur Line array, groupe Silencieux). */
export function branchHeatMult(state: GameState): number {
  return (
    (ownedGear(state, 'mur').effects?.heatMult ?? 1) *
    (ownedGear(state, 'groupe').effects?.heatMult ?? 1)
  );
}
```

  (add `DjDef` to the type imports.) In `tickNight`:
  - power demand: `const briefPower = night.brief === 'pousser' && groupeItem.effects?.pousserPowerFree ? 0 : BRIEF_POWER[night.brief];` then `const demand = 0.35 + 0.5 * (...) + briefPower;`
  - crowd: `const charisme = effectiveCharisme(state, dj);` (replaces `const charisme = dj ? dj.charisme : 2;`)
  - leaving: `const leaving = night.crowd * genre.churn * churnMod * branchChurnMult(state) * retention * leaveMult;`
  - heat: append `* branchHeatMult(state)` to the `night.heat +=` product.
- [ ] In `computeSetQuality`, rename `_night` → `night` and apply the mur bonus:

```ts
export function computeSetQuality(state: GameState, night: NightState, djId: string, brief: Brief): number {
  const def = getDj(djId);
  const member = getCrewMember(state, djId);
  const platines = ownedGear(state, 'platines').value * (state.damaged.platines ? 0.7 : 1);
  const murQuality = ownedGear(state, 'mur').effects?.qualityMult ?? 1;
  const tech = effectiveTechnique(def, member);
  const base = 0.18 + 0.16 * tech;
  return clamp(
    base * platines * murQuality * BRIEF_QUALITY[brief] * fatigueQualityMult(member),
    0.05,
    1.5,
  );
}
```

  (`night` stays unused except for future spot quality in Task 10 — if tsc complains, keep `_night` until Task 10; Task 10 uses it.)
- [ ] Change `dropMontee` to take the state and apply the strobe payoff:

```ts
export function dropMontee(state: GameState, night: NightState): boolean {
  if (night.phase !== 'playing' || night.montee < MONTEE_MIN_DROP) return false;
  const m = night.montee;
  const payoff = ownedGear(state, 'lumieres').effects?.dropMult ?? 1;
  night.vibe = clamp(night.vibe + (0.1 + 0.25 * m) * payoff, 0, 1);
  night.crowd = clamp(night.crowd + night.cap * 0.05 * m * payoff, 0, night.cap);
  night.heat = clamp(night.heat + 0.02 + 0.06 * m, 0, 0.99);
  night.bestDropThisSet = Math.max(night.bestDropThisSet, m);
  night.montee = 0;
  return true;
}
```

  Update the call sites: `src/main.ts` `onDrop` → `dropMontee(state, active.night)`; `src/core/live.test.ts` → `dropMontee(state, night)` (one true-path call in « dropMontee boost la vibe… ») and the refusal test — concretely, destructure `const { state, night } = playingNight();` there and call `dropMontee(state, night)`.
- [ ] In `src/core/economy.ts`, apply the caution discount (import `ownedGear` from `./data`):

```ts
export function cautionCost(state: GameState, spot: SpotDef): number {
  if (spot.tier < 3) return 0;
  const mult = ownedGear(state, 'logistique').effects?.cautionMult ?? 1;
  return Math.round(spot.cap * mult);
}
```

- [ ] `npm run test && npm run build` — green.
- [ ] Commit: `git add -A && git commit -m "feat(core): les voies du matos pèsent sur la sim — charisme, churn, heat, drop"`

---

### Task 5: Boutique à deux voies (UI)

**Files:**
- Modify: `src/ui/strings.ts`, `src/ui/screens.ts`, `src/main.ts`
- Test: `npm run test && npm run build` + manual smoke

- [ ] In `src/ui/strings.ts` add after `gearEffect`:

```ts
  gearBranchNames: {
    platines: { A: 'Précision', B: 'Showmanship' },
    mur: { A: 'Infrabasses', B: 'Line array' },
    groupe: { A: 'Silencieux', B: 'Monstre' },
    lumieres: { A: 'Hypnose', B: 'Stroboscopique' },
    logistique: { A: 'Réseau', B: 'Mobilité' },
  } as const,
  gearBranchTag: (name: string) => `voie ${name}`,
  switchBranch: (name: string, cost: number) => `Changer pour la voie ${name} — ${cost} €`,
```

- [ ] In `src/ui/screens.ts`:
  - change `PrepareCallbacks.onBuy` to `onBuy(cat: GearCategory, branch?: GearBranch): void;` and add `onSwitchBranch(cat: GearCategory): void;` (import `GearBranch` type, plus `nextGearOptions, switchBranchItem` from `../core/data`).
  - replace the `else if (next)` / `else` tail of the gear loop with:

```ts
    } else {
      const options = nextGearOptions(state, cat);
      if (options.length === 0) {
        actions.append(el('div', 'gear-maxed', STR.maxed));
      }
      for (const next of options) {
        const voie = next.branch ? ` (${STR.gearBranchNames[cat][next.branch]})` : '';
        const buyBtn = el('button', 'btn small', `${STR.buy} ${next.nom}${voie} — ${fmtCash(next.price)}`);
        buyBtn.disabled = state.cash < next.price;
        buyBtn.addEventListener('click', () => cb.onBuy(cat, next.branch));
        actions.append(buyBtn);
      }
      const other = switchBranchItem(state, cat);
      if (other?.branch) {
        const sw = el('button', 'btn small ghost', STR.switchBranch(STR.gearBranchNames[cat][other.branch], other.price));
        sw.disabled = state.cash < other.price;
        sw.addEventListener('click', () => cb.onSwitchBranch(cat));
        actions.append(sw);
      }
    }
```

  - show the chosen voie on the current item: after `const nameLine = el('div', 'gear-name', current.nom);` add

```ts
    if (current.branch) nameLine.append(el('span', 'gear-branch-tag', ` · ${STR.gearBranchTag(STR.gearBranchNames[cat][current.branch])}`));
```

- [ ] In `src/main.ts` wire the callbacks:

```ts
    onBuy: (cat, branch) => {
      if (buyGearUpgrade(state, cat, branch)) {
        saveGame(localStorage, state);
        showPrepare();
      }
    },
    onSwitchBranch: (cat) => {
      if (switchGearBranch(state, cat)) {
        saveGame(localStorage, state);
        showPrepare();
      }
    },
```

  (import `switchGearBranch` from `./core/payout`.)
- [ ] Append CSS to `src/style.css`: `.gear-branch-tag { opacity: 0.7; font-size: 0.85em; }`
- [ ] `npm run test && npm run build` — green. Manual smoke: at tier 2 the shop shows two buy buttons (A/B); after buying, one continuation button plus the greyed « Changer de voie » button.
- [ ] Commit: `git add -A && git commit -m "feat(ui): boutique à deux voies — choisir, prolonger, changer de voie"`

---

### Task 6: Sinks crew — cadeau, jour off payé, session studio

**Files:**
- Modify: `src/core/types.ts` (DjState), `src/core/crew.ts`, `src/core/payout.ts` (cutsTotal), `src/core/save.ts` (newGame + migration)
- Modify: `test/payout.test.ts` (cutsTotal signature), `test/save.test.ts` (migration crew defaults)
- Test: append to `test/economy.test.ts`

- [ ] Append the failing tests to `test/economy.test.ts`:

```ts
import {
  buyDayOff,
  buyStudioSession,
  effectiveCut,
  effectiveTechnique,
  giftDj,
} from '../src/core/crew';
import { cutsTotal } from '../src/core/payout';

describe('sinks crew', () => {
  it('cadeau : 500 € × niveau, cut −2 pts plancher 3 %, une seule fois par DJ', () => {
    const state = newGame();
    state.cash = 10000;
    const tonton = state.crew[0];
    expect(giftDj(state, 'tonton')).toBe(true);
    expect(state.cash).toBe(9500); // niveau 0 compte comme 1
    expect(effectiveCut(getDj('tonton'), tonton)).toBeCloseTo(0.03, 5); // 0.05 − 0.02 ≥ plancher
    expect(giftDj(state, 'tonton')).toBe(false); // une fois par DJ
  });

  it('le cadeau passe dans cutsTotal au payout', () => {
    const state = newGame();
    state.cash = 10000;
    giftDj(state, 'tonton');
    const night = finishedNight(state);
    expect(cutsTotal(state, night)).toBeCloseTo(0.03, 5);
  });

  it('jour off payé : 100 € × niveau, toute la fatigue récupérée', () => {
    const state = newGame();
    state.cash = 1000;
    state.crew[0].fatigue = 0.8;
    expect(buyDayOff(state, 'tonton')).toBe(true);
    expect(state.cash).toBe(900);
    expect(state.crew[0].fatigue).toBe(0);
    expect(buyDayOff(state, 'tonton')).toBe(false); // déjà frais
  });

  it('session studio : 1 200 €, +0.5 technique permanent, plafonné à +1', () => {
    const state = newGame();
    state.cash = 10000;
    const base = effectiveTechnique(getDj('tonton'), state.crew[0]);
    expect(buyStudioSession(state, 'tonton')).toBe(true);
    expect(effectiveTechnique(getDj('tonton'), state.crew[0])).toBeCloseTo(base + 0.5, 5);
    expect(buyStudioSession(state, 'tonton')).toBe(true);
    expect(buyStudioSession(state, 'tonton')).toBe(false); // max +1
    expect(state.cash).toBe(10000 - 2400);
    expect(effectiveTechnique(getDj('tonton'), state.crew[0])).toBeCloseTo(base + 1, 5);
  });

  it('refuse quand la caisse ne suit pas', () => {
    const state = newGame();
    state.cash = 100;
    state.crew[0].fatigue = 0.5;
    expect(giftDj(state, 'tonton')).toBe(false);
    expect(buyStudioSession(state, 'tonton')).toBe(false);
    expect(state.cash).toBe(100);
  });
});
```

- [ ] Run: `npx vitest run test/economy.test.ts` — fails (exports missing).
- [ ] In `src/core/types.ts`, extend `DjState`:

```ts
export interface DjState {
  id: string;
  xp: number;
  /** 0 = fresh, 1 = exhausted; recovers per rested night (a night played no set) */
  fatigue: number;
  setsPlayed: number;
  /** 🎁 cadeau reçu — son cut a baissé de 2 points, une fois pour toutes */
  gifted: boolean;
  /** 🎚 bonus de technique permanent acheté en studio (0 / 0.5 / 1) */
  studioBonus: number;
}
```

- [ ] In `src/core/crew.ts` add the constants and functions (and use `djLevel`):

```ts
export const GIFT_BASE = 500;
export const GIFT_CUT_REDUCTION = 0.02;
export const GIFT_CUT_FLOOR = 0.03;
export const DAYOFF_BASE = 100;
export const STUDIO_COST = 1200;
export const STUDIO_STEP = 0.5;
export const STUDIO_MAX = 1;

export function giftCost(member: DjState): number {
  return GIFT_BASE * Math.max(1, djLevel(member));
}

export function dayOffCost(member: DjState): number {
  return DAYOFF_BASE * Math.max(1, djLevel(member));
}

/** Cut réel d'un DJ du crew : le cadeau le fait baisser de 2 points (plancher 3 %). */
export function effectiveCut(def: DjDef, member: DjState): number {
  return member.gifted ? Math.max(GIFT_CUT_FLOOR, def.cut - GIFT_CUT_REDUCTION) : def.cut;
}

/** 🎁 Cadeau : rend les gros cuts négociables — une fois par DJ. */
export function giftDj(state: GameState, djId: string): boolean {
  const member = getCrewMember(state, djId);
  const cost = giftCost(member);
  if (member.gifted || state.cash < cost) return false;
  state.cash -= cost;
  member.gifted = true;
  return true;
}

/** 🛋 Jour off payé : toute la fatigue récupérée, même s'il joue la prochaine nuit. */
export function buyDayOff(state: GameState, djId: string): boolean {
  const member = getCrewMember(state, djId);
  const cost = dayOffCost(member);
  if (member.fatigue <= 0 || state.cash < cost) return false;
  state.cash -= cost;
  member.fatigue = 0;
  return true;
}

/** 🎚 Session studio : +0.5 de technique permanent, max +1 par DJ. */
export function buyStudioSession(state: GameState, djId: string): boolean {
  const member = getCrewMember(state, djId);
  if (member.studioBonus >= STUDIO_MAX || state.cash < STUDIO_COST) return false;
  state.cash -= STUDIO_COST;
  member.studioBonus += STUDIO_STEP;
  return true;
}
```

  and fold the studio into `effectiveTechnique`:

```ts
export function effectiveTechnique(def: DjDef, state: DjState): number {
  return def.technique + djLevel(state) * TECH_PER_LEVEL + (state.studioBonus ?? 0);
}
```

  `recruitDj` pushes the new fields: `state.crew.push({ id: djId, xp: 0, fatigue: 0, setsPlayed: 0, gifted: false, studioBonus: 0 });`
- [ ] In `src/core/payout.ts`, route the cut through the crew state:

```ts
import { applyNightRest, effectiveCut, getCrewMember } from './crew';

export function cutsTotal(state: GameState, night: NightState): number {
  const played = playedDjs(night);
  let total = 0;
  for (const id of played) total += effectiveCut(getDj(id), getCrewMember(state, id));
  return Math.min(0.6, total);
}
```

  and update the two internal calls in `settleNight`/`applyBust` to `cutsTotal(state, night)`.
- [ ] In `src/core/save.ts`: `newGame` crew becomes `[{ id: 'tonton', xp: 0, fatigue: 0, setsPlayed: 0, gifted: false, studioBonus: 0 }]`, and `migrateV2` gains, before setting `o.gearBranch`:

```ts
  for (const m of (o.crew as Array<Record<string, unknown>>) ?? []) {
    m.gifted = m.gifted ?? false;
    m.studioBonus = m.studioBonus ?? 0;
  }
```

- [ ] Update existing tests:
  - `test/payout.test.ts` line 51: `expect(cutsTotal(state, night)).toBeCloseTo(0.15, 5);`
  - `test/save.test.ts` roundtrip push: `state.crew.push({ id: 'gamine', xp: 500, fatigue: 0.4, setsPlayed: 7, gifted: false, studioBonus: 0 });` and extend the migration test with `expect(loaded!.crew[0].gifted).toBe(false); expect(loaded!.crew[0].studioBonus).toBe(0);` (the v2 fixture's crew must omit those fields: build it as `const v2 = JSON.parse(serialize(newGame())) as Record<string, unknown>; v2.version = 2; delete v2.gearBranch; for (const m of v2.crew as Array<Record<string, unknown>>) { delete m.gifted; delete m.studioBonus; }` then the gear override).
  - `test/crew.test.ts` `fatigueQualityMult` literal: `{ id: 'x', xp: 0, fatigue: 1, setsPlayed: 0, gifted: false, studioBonus: 0 }`.
- [ ] `npm run test && npm run build` — green.
- [ ] Commit: `git add -A && git commit -m "feat(core): sinks crew — cadeau, jour off payé, session studio"`

---

### Task 7: Les sinks crew sur la carte du DJ (UI)

**Files:**
- Modify: `src/ui/strings.ts`, `src/ui/screens.ts`, `src/main.ts`
- Test: `npm run test && npm run build` + manual smoke

- [ ] Strings (after `newRecruit`):

```ts
  giftBtn: (cost: number) => `🎁 Cadeau (${cost} €)`,
  giftHint: 'Son cut baisse de 2 points — une fois par DJ',
  dayOffBtn: (cost: number) => `🛋 Jour off (${cost} €)`,
  dayOffHint: 'Récupère toute sa fatigue, même s’il joue la prochaine nuit',
  studioBtn: (cost: number) => `🎚 Studio (${cost} €)`,
  studioHint: '+0,5 technique permanent (max +1)',
```

- [ ] In `src/ui/screens.ts`:
  - add to `PrepareCallbacks`: `onGift(djId: string): void; onDayOff(djId: string): void; onStudio(djId: string): void;`
  - imports: `import { djLevel, fatigueMalus, lockedDjs, recruitableDjs, effectiveCut, giftCost, dayOffCost, STUDIO_COST, STUDIO_MAX } from '../core/crew';`
  - the crew-member card is currently a `<button>`; nested buttons are invalid DOM, so change it to a div: `const card = el('div', \`card dj-card${aboard ? ' selected' : ''}\`);` (the existing `card.addEventListener('click', ...)` toggle stays).
  - replace the cut display on crew cards with the effective cut: in `riskLine`, use `STR.cut(effectiveCut(def, member))`. Same in `showTransition` (`member` is in scope there): `STR.cut(effectiveCut(def, member))`.
  - after `info.append(fat);` in the crew loop, add the sink buttons:

```ts
    const sinks = el('div', 'crew-sinks');
    const sinkBtn = (label: string, hint: string, enabled: boolean, onClick: () => void) => {
      const b = el('button', 'btn small', label);
      b.title = hint;
      b.disabled = !enabled;
      b.addEventListener('click', (e) => {
        e.stopPropagation(); // ne pas (dé)sélectionner le DJ
        onClick();
      });
      sinks.append(b);
    };
    if (!member.gifted) {
      const cost = giftCost(member);
      sinkBtn(STR.giftBtn(cost), STR.giftHint, state.cash >= cost, () => cb.onGift(member.id));
    }
    if (member.fatigue > 0) {
      const cost = dayOffCost(member);
      sinkBtn(STR.dayOffBtn(cost), STR.dayOffHint, state.cash >= cost, () => cb.onDayOff(member.id));
    }
    if (member.studioBonus < STUDIO_MAX) {
      sinkBtn(STR.studioBtn(STUDIO_COST), STR.studioHint, state.cash >= STUDIO_COST, () => cb.onStudio(member.id));
    }
    if (sinks.childElementCount > 0) info.append(sinks);
```

- [ ] In `src/main.ts` wire (import `buyDayOff, buyStudioSession, giftDj` from `./core/crew`):

```ts
    onGift: (djId) => {
      if (giftDj(state, djId)) {
        saveGame(localStorage, state);
        showPrepare();
      }
    },
    onDayOff: (djId) => {
      if (buyDayOff(state, djId)) {
        saveGame(localStorage, state);
        showPrepare();
      }
    },
    onStudio: (djId) => {
      if (buyStudioSession(state, djId)) {
        saveGame(localStorage, state);
        showPrepare();
      }
    },
```

- [ ] `npm run test && npm run build` — green. Manual smoke: buttons appear on crew cards, spend cash, and disappear/disable correctly.
- [ ] Commit: `git add -A && git commit -m "feat(ui): les sinks crew sur la carte du DJ"`

---

### Task 8: 4 nouveaux genres — tribe, hardcore, downtempo, electro

**Files:**
- Modify: `src/core/types.ts` (GenreId), `src/core/data.ts` (GENRES), `src/core/night.ts` (MONTEE_GENRE), `src/audio/synth.ts` (BUILDERS), `public/audio/manifest.json`
- Modify: `test/data.test.ts`, `src/audio/synth.test.ts` (its genre maps are full `Record<GenreId, …>` — tsc forces the extension)
- Test: `npm run test && npm run build` (`test/synth.test.ts` iterates `GENRES` at runtime and needs no edit)

- [ ] Update `test/data.test.ts` `describe('genres')` first (failing):

```ts
describe('genres', () => {
  it('has 12 genres with unique ids', () => {
    expect(GENRES).toHaveLength(12);
    expect(new Set(GENRES.map((g) => g.id)).size).toBe(12);
  });

  it('models dub as slow/chill and acid as hot', () => {
    expect(getGenre('dub').heatMult).toBeLessThan(getGenre('hardtek').heatMult);
    expect(getGenre('acid').heatMult).toBeGreaterThan(getGenre('hardtek').heatMult);
    expect(getGenre('dub').churn).toBeLessThan(getGenre('hardtek').churn);
  });

  it('models hardcore as the hottest and downtempo as the chillest', () => {
    expect(getGenre('hardcore').heatMult).toBeGreaterThan(getGenre('frenchcore').heatMult);
    expect(getGenre('downtempo').heatMult).toBeLessThan(getGenre('dub').heatMult);
  });
});
```

- [ ] Run: `npx vitest run test/data.test.ts` — fails (8 genres, unknown ids → tsc error first).
- [ ] In `src/core/types.ts` extend `GenreId`:

```ts
export type GenreId =
  | 'hardtek'
  | 'acid'
  | 'dub'
  | 'frenchcore'
  | 'mentale'
  | 'techno'
  | 'raggatek'
  | 'darkpsy'
  | 'tribe'
  | 'hardcore'
  | 'downtempo'
  | 'electro';
```

- [ ] In `src/core/data.ts` append to `GENRES`:

```ts
  {
    id: 'tribe',
    nom: 'Tribe',
    bpm: 165,
    arrival: 1.05,
    churn: 0.009,
    heatMult: 1.0,
    description: 'Le kick roulé des montagnes. Hypnotique, tribal, increvable.',
  },
  {
    id: 'hardcore',
    nom: 'Hardcore',
    bpm: 220,
    arrival: 1.6,
    churn: 0.025,
    heatMult: 1.8,
    description: 'Au-delà du rouge. Ça déferle, ça crame, ça repart en ambulance.',
  },
  {
    id: 'downtempo',
    nom: 'Downtempo',
    bpm: 95,
    arrival: 0.55,
    churn: 0.003,
    heatMult: 0.5,
    description: 'Le souffle entre deux tempêtes. Personne ne part, personne ne s’énerve.',
  },
  {
    id: 'electro',
    nom: 'Electro',
    bpm: 128,
    arrival: 1.2,
    churn: 0.012,
    heatMult: 0.9,
    description: 'Carré, funky, fédérateur. Le son qui fait danser même les guetteurs.',
  },
```

- [ ] In `src/core/night.ts` extend `MONTEE_GENRE` (tsc forces it — it is a full `Record<GenreId, number>`):

```ts
  tribe: 1.15,
  hardcore: 1.35,
  downtempo: 0.7,
  electro: 1.0,
```

- [ ] In `src/audio/synth.ts` add four builders and register them in `BUILDERS` (also a full `Record<GenreId, ...>`):

```ts
function buildTribe(): GenrePatterns {
  const bpm = 165;
  const steps = loopSteps();
  // tribe : kick roulé (doubles en fin de bar), sub tribal, stab hypnotique
  const kick = fourOnFloor(steps);
  kick.push({ step: 14, freq: 50, vel: 0.7, len: 1 }, { step: 30, freq: 50, vel: 0.7, len: 1 });
  const sub: Note[] = [];
  const bassline = [0, -5, -2, 0, -7, -5, 0, -2];
  for (let i = 0; i < steps; i += 4) {
    sub.push({ step: i + 2, freq: note(bassline[(i / 4) % bassline.length] - 5), vel: 0.9, len: 2 });
  }
  const lead = [
    ...onSteps([0, 6, 16, 22], note(10), 0.7, 2),
    ...onSteps([10, 26], note(5), 0.6, 1),
  ];
  const hats: Note[] = [];
  for (let s = 2; s < steps; s += 4) hats.push({ step: s, freq: 9500, vel: 0.7, len: 1 });
  for (let s = 1; s < steps; s += 4) hats.push({ step: s, freq: 12000, vel: 0.25, len: 1 });
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'stab', kick, sub, lead, hats };
}

function buildHardcore(): GenrePatterns {
  const bpm = 220;
  const steps = loopSteps();
  // 220 BPM : kick massif doublé au sub, hoover en rafales
  const sub: Note[] = [];
  for (let s = 0; s < steps; s += 4) sub.push({ step: s, freq: note(-7), vel: 1, len: 3 });
  const riff = [0, 0, 5, 3, 0, 7, 5, 3];
  const lead: Note[] = [];
  for (let i = 0; i < steps; i += 2) {
    if (i % 8 !== 6) {
      lead.push({ step: i, freq: note(riff[(i / 2) % riff.length]), vel: i % 8 === 0 ? 1 : 0.75, len: 2 });
    }
  }
  const hats: Note[] = [];
  for (let s = 0; s < steps; s += 2) hats.push({ step: s, freq: 11000, vel: s % 4 === 2 ? 0.9 : 0.4, len: 1 });
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'hoover', kick: fourOnFloor(steps), sub, lead, hats };
}

function buildDowntempo(): GenrePatterns {
  const bpm = 95;
  const steps = loopSteps();
  // mi-temps planant : kick clairsemé, long sub, arpège doux
  const kick = onSteps([0, 10, 16, 26], 50, 0.9, 1);
  const sub: Note[] = [];
  for (let s = 0; s < steps; s += 8) sub.push({ step: s, freq: note(-12), vel: 0.85, len: 7 });
  const arp = [0, 7, 12, 10];
  const lead: Note[] = [];
  for (let s = 0; s < steps; s += 4) {
    lead.push({ step: s + 2, freq: note(arp[(s / 4) % arp.length] + 12), vel: 0.5, len: 3 });
  }
  const hats = onSteps([4, 12, 20, 28], 8500, 0.35, 1);
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'arp', kick, sub, lead, hats };
}

function buildElectro(): GenrePatterns {
  const bpm = 128;
  const steps = loopSteps();
  // electro carré : 4-floor propre, basse syncopée, stab brillant sur l'offbeat
  const sub: Note[] = [];
  const bassline = [0, 0, 3, 0, -2, 0, 5, 3];
  for (let i = 0; i < steps; i += 4) {
    sub.push({ step: i + 2, freq: note(bassline[(i / 4) % bassline.length] - 12), vel: 0.85, len: 2 });
  }
  const lead = [
    ...onSteps([2, 10, 18, 26], note(12), 0.75, 1),
    ...onSteps([6, 22], note(15), 0.6, 1),
  ];
  const hats: Note[] = [];
  for (let s = 2; s < steps; s += 4) hats.push({ step: s, freq: 10500, vel: 0.65, len: 1 });
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'stab', kick: fourOnFloor(steps), sub, lead, hats };
}
```

  and in `BUILDERS`: `tribe: buildTribe, hardcore: buildHardcore, downtempo: buildDowntempo, electro: buildElectro,`.
- [ ] In `src/audio/synth.test.ts`, extend the three genre maps (they are typed over the full `GenreId` — `npm run build` fails otherwise): append `'tribe', 'hardcore', 'downtempo', 'electro'` to `ALL_GENRES`; add `tribe: 165, hardcore: 220, downtempo: 95, electro: 128` to `EXPECTED_BPM`; add `tribe: 'stab', hardcore: 'hoover', downtempo: 'arp', electro: 'stab'` to `EXPECTED_LEAD` (matching the builders above).
- [ ] Append the four entries to `public/audio/manifest.json` (same pattern as the existing eight):

```json
  "tribe":      { "bpm": 165, "bars": 4, "stems": { "kick": "tribe-kick.ogg", "sub": "tribe-sub.ogg", "lead": "tribe-lead.ogg", "hats": "tribe-hats.ogg" } },
  "hardcore":   { "bpm": 220, "bars": 4, "stems": { "kick": "hardcore-kick.ogg", "sub": "hardcore-sub.ogg", "lead": "hardcore-lead.ogg", "hats": "hardcore-hats.ogg" } },
  "downtempo":  { "bpm": 95,  "bars": 4, "stems": { "kick": "downtempo-kick.ogg", "sub": "downtempo-sub.ogg", "lead": "downtempo-lead.ogg", "hats": "downtempo-hats.ogg" } },
  "electro":    { "bpm": 128, "bars": 4, "stems": { "kick": "electro-kick.ogg", "sub": "electro-sub.ogg", "lead": "electro-lead.ogg", "hats": "electro-hats.ogg" } }
```

  Note: the `.ogg` stems land in a later asset commit (repo convention, cf. `00716cb`). Until then `AudioEngine.loadRealStems` catches the failed fetch and falls back to the synth builders above — the designed degradation path.
- [ ] `npm run test && npm run build` — green.
- [ ] Commit: `git add -A && git commit -m "feat(audio,core): 4 nouveaux genres — tribe, hardcore, downtempo, electro"`

---

### Task 9: 4 nouveaux DJs et seuils de rep recalés (×1.3)

**Files:**
- Modify: `src/core/data.ts` (DJS), `tools/build-assets.mjs` (DJ_SPRITES)
- Modify: `test/data.test.ts`, `test/crew.test.ts`, `test/payout.test.ts` (rep fixtures that recruit gamine)
- Test: `npm run test`

- [ ] Update the failing tests first:
  - `test/data.test.ts` `describe('djs')` — `expect(DJS).toHaveLength(12);` (rest of the assertions already generalize: sorted repReq, stats in range, cut ≤ 0.3, genre↔DJ bijection now 12↔12).
  - `test/crew.test.ts` — `expect(lockedDjs(state)).toHaveLength(11);` and in the same test add `expect(available).toContain('plume');` (rep 40 fixture).
  - gamine restretched 6 → 8 breaks the fixtures that recruit her at `state.rep = 6;` — change all three to `state.rep = 8;`: `test/payout.test.ts` « rests crew who sat out the night… » and « still rests the benched crew… », `test/crew.test.ts` « rests crew who did not play tonight… » (otherwise `recruitDj` refuses and the destructured `gamine` is `undefined`).
- [ ] Run: `npx vitest run test/data.test.ts test/crew.test.ts` — fails (8 DJs).
- [ ] In `src/core/data.ts`, replace `DJS` with the 12-DJ roster, sorted by `repReq`. Existing thresholds are restretched ×1.3 (the 0–500 range becomes 0–650, spec §4): gamine 6→8, boblepine 20→26, kilowatt 55→72, memeacide 160→210, notaire 260→340, sirene 380→495, fantome 500→650. Keep every existing field identical except `repReq`; insert the newcomers:

```ts
  // ... tonton (repReq 0), gamine (8) ...
  {
    id: 'boblepine', /* repReq: 26 */ ...
  },
  {
    id: 'plume',
    nom: 'Plume',
    description: 'Elle joue à 95 BPM et chuchote au public. Personne ne part avant la fin.',
    technique: 2,
    charisme: 5,
    genre: 'downtempo',
    risk: 'discret',
    cut: 0.08,
    repReq: 40,
    sprite: 9,
  },
  // kilowatt (72)
  {
    id: 'doyenne',
    nom: 'La Doyenne',
    description: 'Trente ans de tribe dans les doigts. Quand elle roule le kick, la montagne suit.',
    technique: 3,
    charisme: 5,
    genre: 'tribe',
    risk: 'normal',
    cut: 0.16,
    repReq: 100,
    sprite: 13,
  },
  // memeacide (210)
  {
    id: 'morse',
    nom: 'Morse',
    description: '220 BPM, zéro compromis. Il tape le kick comme un SOS — les bleus répondent toujours.',
    technique: 5,
    charisme: 2,
    genre: 'hardcore',
    risk: 'chaud',
    cut: 0.2,
    repReq: 320,
    sprite: 5,
  },
  // notaire (340)
  {
    id: 'volt',
    nom: 'Volt',
    // RÉVISION CHANTIER 1 : Volt se débloque en gagnant le soundclash (Story D),
    // premier DJ débloqué par le gameplay. Fallback : seuil de rep 420.
    description: 'Le headliner rival. Electro carrée, ego carré — il ne joue que pour les crews qui l’ont battu.',
    technique: 4,
    charisme: 4,
    genre: 'electro',
    risk: 'normal',
    cut: 0.24,
    repReq: 420,
    sprite: 1,
  },
  // sirene (495), fantome (650)
```

  Final order by repReq: tonton 0, gamine 8, boblepine 26, plume 40, kilowatt 72, doyenne 100, memeacide 210, morse 320, notaire 340, volt 420, sirene 495, fantome 650.
- [ ] In `tools/build-assets.mjs`, extend `DJ_SPRITES` (premade index = `sprite + 1`, matching the existing mapping e.g. fantome 19→20):

```js
const DJ_SPRITES = {
  tonton: 4,
  gamine: 8,
  boblepine: 12,
  kilowatt: 3,
  memeacide: 16,
  notaire: 7,
  sirene: 18,
  fantome: 20,
  plume: 10,
  doyenne: 14,
  morse: 6,
  volt: 2,
};
```

- [ ] Run `npm run assets` to regenerate `public/assets/portraits/{plume,doyenne,morse,volt}.png` (the pack is present in `assets-src/` on this machine). NB: `buildPortraits` throws if the pack were absent (only props/terrain are warn-only) — in that case skip this step and note it in the commit body; `public/assets/` is gitignored, the UI shows the `alt` text meanwhile.
- [ ] `npm run test && npm run build` — green. The harness (`src/core/progression.test.ts`) still passes: gamine now needs rep 8 and two champ nights yield ≈ 24.
- [ ] Commit: `git add -A && git commit -m "feat(core): 4 nouveaux DJs — La Doyenne, Morse, Plume, Volt — et seuils recalés"`

---

### Task 10: 3 nouveaux spots, leviers de spot et Teknival à 650

**Files:**
- Modify: `src/core/types.ts` (SpotId + SpotDef fields), `src/core/data.ts` (SPOTS), `src/core/night.ts` (churn/quality), `src/core/payout.ts` (donation), `src/render/scene.ts` (RECIPES)
- Modify: `test/data.test.ts`, `src/core/progression.test.ts`, `test/payout.test.ts` (hangar threshold), `server/db.mjs` (SPOTS whitelist)
- Test: append to `test/economy.test.ts`

- [ ] Append the failing tests to `test/economy.test.ts`:

```ts
describe('nouveaux spots', () => {
  it('tunnel : acoustique énorme (+15 % qualité)', () => {
    const state = newGame();
    state.rep = 1000;
    const tunnel = mkNight(state, 'tunnel', ['tonton'], 10);
    const champ = mkNight(state, 'champ', ['tonton'], 10);
    expect(computeSetQuality(state, tunnel, 'tonton', 'normal')).toBeCloseTo(
      computeSetQuality(state, champ, 'tonton', 'normal') * 1.15,
      5,
    );
  });

  it('château squatté : prix libre ×1.3 au payout', () => {
    const state = newGame();
    state.rep = 1000;
    const night = mkNight(state, 'chateau', ['tonton'], 11);
    Object.assign(night, {
      t: 540, phase: 'ended', sunrise: true, bank: 100, peakCrowd: 0, vibeSum: 0,
      vibeSamples: 540, playedSets: [{ djId: 'tonton', brief: 'normal' }],
    });
    const result = settleNight(state, night);
    expect(result.donationMult).toBeCloseTo(1.3, 5); // (1 + 0 + 0) × 1.3
  });

  it('plage abandonnée : le churn du spot est plus faible qu’ailleurs', () => {
    expect(getSpot('plage').churnMult).toBeLessThan(1);
    expect(getSpot('champ').churnMult).toBe(1);
  });
});
```

- [ ] Run: `npx vitest run test/economy.test.ts` — fails (unknown spot ids → tsc).
- [ ] In `src/core/types.ts`:

```ts
export type SpotId =
  | 'champ'
  | 'foret'
  | 'carriere'
  | 'plage'
  | 'hangar'
  | 'tunnel'
  | 'chateau'
  | 'friche'
  | 'teknival';
```

  and extend `SpotDef` (after `powerMult`):

```ts
  /** quirk: crowd churn multiplier (plage = on reste) */
  churnMult: number;
  /** quirk: set quality multiplier (tunnel = acoustique énorme) */
  qualityMult: number;
  /** quirk: prix libre multiplier at settle (château = ×1.3) */
  donationMult: number;
```

- [ ] In `src/core/data.ts`, add `churnMult: 1, qualityMult: 1, donationMult: 1,` to the six existing spots, restretch reps ×1.3 (foret 12→16, carriere 45→60, hangar 150→195, friche 280→365, **teknival 500→650**) and insert the three newcomers, keeping the array sorted by `repReq` (champ 0, foret 16, carriere 60, plage 90, hangar 195, tunnel 200, chateau 350, friche 365, teknival 650):

```ts
  {
    id: 'plage',
    nom: 'Plage abandonnée',
    description: 'Du sable, des braises, l’horizon. On arrive lentement et on ne repart plus.',
    cap: 300,
    arrival: 1.1,
    heatBuild: 0.008,
    repReq: 90,
    tier: 3,
    duration: 360,
    setCount: 4,
    priceMult: 1,
    powerMult: 1,
    churnMult: 0.7,
    qualityMult: 1,
    donationMult: 1,
  },
  {
    id: 'tunnel',
    nom: 'Tunnel désaffecté',
    description: 'Une acoustique de cathédrale enterrée — et chaque écho remonte jusqu’aux bleus.',
    cap: 500,
    arrival: 1.9,
    heatBuild: 0.026,
    repReq: 200,
    tier: 4,
    duration: 480,
    setCount: 4,
    priceMult: 1.2,
    powerMult: 1,
    churnMult: 1,
    qualityMult: 1.15,
    donationMult: 1,
  },
  {
    // RÉVISION CHANTIER 1 : déblocage = arc « le fermier » fini + rep 350.
    // Fallback : rep 350 seul ; « descente retardée » → heatBuild bas pour sa taille.
    id: 'chateau',
    nom: 'Château squatté',
    description: 'Un castel oublié, un fermier complice. Prix libre généreux et les bleus loin derrière.',
    cap: 800,
    arrival: 2.4,
    heatBuild: 0.014,
    repReq: 350,
    tier: 5,
    duration: 540,
    setCount: 5,
    priceMult: 1,
    powerMult: 1,
    churnMult: 1,
    qualityMult: 1,
    donationMult: 1.3,
  },
```

- [ ] Apply the levers:
  - `src/core/night.ts` `computeSetQuality`: multiply by `getSpot(night.spotId).qualityMult` (this is where the `night` param earns its name — `const spotQ = getSpot(night.spotId).qualityMult;` then `base * platines * murQuality * spotQ * ...`).
  - `src/core/night.ts` `tickNight` leaving: `* spot.churnMult` (spot is already in scope).
  - `src/core/payout.ts` `settleNight`: `const donationMult = (1 + 0.8 * vibe + 0.6 * (night.peakCrowd / night.cap)) * spot.donationMult;` — move the `const spot = getSpot(night.spotId);` line above it.
- [ ] In `src/render/scene.ts` add the three `RECIPES` entries (tsc forces the full `Record<SpotId, SpotRecipe>`):

```ts
  plage: {
    terrain: ['grass_3', 'grass_1'],
    props: [
      { prop: 'camper_right', x: 10, y: 190 },
      { prop: 'bush_2', x: 60, y: 96 },
      { prop: 'bush_1', x: 420, y: 100 },
      { prop: 'tent_2', x: 430, y: 190 },
      { prop: 'campfire_1', x: 400, y: 220 },
    ],
    fires: [{ x: 408, y: 228, r: 32 }],
  },
  tunnel: {
    terrain: ['asphalt_1', 'asphalt_3'],
    props: [
      { prop: 'container_1', x: 4, y: 92 },
      { prop: 'container_2', x: 430, y: 92 },
      { prop: 'barrel_1', x: 70, y: 108 },
      { prop: 'scrap_pile', x: 16, y: 200 },
      { prop: 'barrel_2', x: 420, y: 160 },
      { prop: 'barrier', x: 8, y: 236 },
      { prop: 'barrier', x: 440, y: 236 },
    ],
    fires: [{ x: 90, y: 116, r: 22 }],
  },
  chateau: {
    terrain: ['grass_2', 'grass_3'],
    props: [
      { prop: 'bunker', x: 8, y: 86 },
      { prop: 'tree_big', x: 430, y: 88 },
      { prop: 'tree_med_2', x: 380, y: 102 },
      { prop: 'tent_1', x: 10, y: 200 },
      { prop: 'tent_3', x: 430, y: 196 },
      { prop: 'campfire_1', x: 60, y: 226 },
      { prop: 'camper_left', x: 380, y: 230 },
    ],
    fires: [{ x: 68, y: 234, r: 28 }],
  },
```

  (placed between the existing entries so the object reads in unlock order; key order is cosmetic.)
- [ ] Update `test/data.test.ts` `describe('spots')`:

```ts
  it('has 9 spots sorted by reputation requirement, teknival last at 650', () => {
    expect(SPOTS).toHaveLength(9);
    const reqs = SPOTS.map((s) => s.repReq);
    expect([...reqs].sort((a, b) => a - b)).toEqual(reqs);
    expect(SPOTS[8].id).toBe('teknival');
    expect(getSpot('teknival').repReq).toBe(650);
    expect(SPOTS[0].repReq).toBe(0);
  });
```

  (keep the duration/power-quirk tests as-is — champ/teknival/carriere values are untouched.)
- [ ] Update `test/payout.test.ts` « unlocks spots with reputation » — hangar is restretched 150 → 195, so `state.rep = 150;` becomes `state.rep = 195;` (the `expect(isSpotUnlocked(state, 'hangar')).toBe(true)` right after it stays).
- [ ] In `server/db.mjs`, extend the `SPOTS` whitelist with `'plage', 'tunnel', 'chateau'` so leaderboard submissions from the new spots pass `validateScore` (the server suite runs via `node --test server/test/`, outside vitest — unaffected by `npm run test`).
- [ ] Update `src/core/progression.test.ts` second test's last assertion (forêt restretched 12→16; measured rep after 4 nights ≈ 51):

```ts
    expect(state.rep).toBeGreaterThanOrEqual(16); // forêt threshold after restretch ×1.3
```

- [ ] `npm run test && npm run build` — green.
- [ ] Commit: `git add -A && git commit -m "feat(core,render): 3 nouveaux spots — plage, tunnel, château squatté — Teknival à 650"`

---

### Task 11: Harness — no-softlock simulé et temps-vers-Teknival

**Files:**
- Modify: `src/core/progression.test.ts`
- Test: `npm run test`

- [ ] Append two describes to `src/core/progression.test.ts` (extend the imports: `GEAR_CATEGORIES, SPOTS, getSpot` from `./data`, `applyBust, buyGearUpgrade` from `./payout`, `getCrewMember, recruitDj, recruitableDjs` from `./crew`):

```ts
describe('no-softlock (spec chantier 2, §5)', () => {
  it('jouer au Champ paumé avec le starter ne perd jamais d’argent', () => {
    // starter = groupe tier 0 (essence gratuite) + stock léger (0 €) + tier 1 (pas de caution)
    for (const seed of [11, 22, 33, 44, 55, 66, 77, 88]) {
      const state = newGame(42);
      const before = state.cash;
      playNight(state, seed);
      expect(state.cash).toBeGreaterThanOrEqual(before);
    }
  });
});

describe('temps-vers-Teknival (politique autoplay)', () => {
  /** Une carrière gloutonne : plus gros spot débloqué, tout le crew, consigne normale. */
  function autoCareer(): number {
    const state = newGame(42);
    let nights = 0;
    const teknivalRep = getSpot('teknival').repReq; // 650
    while (state.rep < teknivalRep && nights < 200) {
      for (const d of recruitableDjs(state)) recruitDj(state, d.id);
      const spot = [...SPOTS]
        .filter((s) => s.id !== 'teknival' && state.rep >= s.repReq)
        .at(-1)!;
      const present = state.crew.map((d) => d.id);
      const night = createNight(state, spot.id, present, 1000 + nights, {
        barStock: 'normal',
        caution: state.cash >= spot.cap * 2,
      });
      for (let guard = 0; guard < 100_000 && night.phase !== 'ended'; guard++) {
        if (night.phase === 'transition') {
          const freshest = night.presentDjs.reduce((a, b) =>
            getCrewMember(state, a).fatigue <= getCrewMember(state, b).fatigue ? a : b,
          );
          startSet(state, night, freshest, 'normal');
        }
        if (night.phase === 'event') resolveEvent(state, night, 0);
        tickNight(state, night, 0.1);
      }
      if (night.busted) applyBust(state, night);
      else settleNight(state, night);
      // achats gloutons : le moins cher d'abord, voie A par défaut au tier 3
      let bought = true;
      while (bought) {
        bought = false;
        for (const cat of GEAR_CATEGORIES) {
          if (buyGearUpgrade(state, cat) || buyGearUpgrade(state, cat, 'A')) bought = true;
        }
      }
      nights += 1;
    }
    return nights;
  }

  it('la courbe tient : Teknival ni trop tôt (≥ 30 nuits) ni hors de portée (< 200)', () => {
    const nights = autoCareer();
    // baseline pré-chantier mesurée ≈ 10 nuits vers rep 500 ; cible spec : ≥ 3× → ≥ 30
    expect(nights).toBeGreaterThanOrEqual(30);
    expect(nights).toBeLessThan(200);
  });
});
```

- [ ] Run: `npx vitest run src/core/progression.test.ts` — observe the printed result. Tuning loop if either bound fails (these are the only sanctioned levers, in order):
  - `nights < 30` (too fast): raise the restretched `repReq` values in `SPOTS`/`DJS` by another +10 % (e.g. teknival 650 → 720 is **not** allowed — 650 is locked by spec; instead lower `SUNRISE_REP`-adjacent gains is also off-limits; raise the intermediate spot thresholds: hangar 195→220, tunnel 200→230, chateau 350→380, friche 365→400) and update `test/data.test.ts`'s 650 assertion only if teknival itself moved (it must not).
  - `nights >= 200` (unreachable): lower the intermediate thresholds by 10 % and re-run; the no-softlock test must stay green in both directions.
  Document the final measured value in a comment next to the assertion.
- [ ] Run the full gate: `npm run test && npm run build` — green.
- [ ] Commit: `git add -A && git commit -m "test(core): harness — no-softlock simulé et temps-vers-Teknival ≥ 3× l'actuel"`

---

## Spec coverage map

| Spec section | Task(s) |
|---|---|
| §1 Frais de nuit (essence, stock bar, caution) | 1, 2 |
| §2 Matos tiers 4–5, branches A/B, prix ×2.5 | 3, 4, 5 |
| §3 Sinks crew (cadeau, jour off, studio) | 6, 7 |
| §4 4 DJs / 4 genres / 3 spots | 8, 9, 10 |
| §4 Intervalles de rep recalés (Teknival 650) | 9 (DJs), 10 (spots) |
| §5 Cibles de courbe (no-softlock, temps ×3) | 11 (+ harness updates in 3 & 10) |
| Tests (economy.test.ts, harness) | 1, 3, 4, 6, 10, 11 |
| Architecture data-driven | data/economy/crew/payout split, all tasks |
| Hors-scope (salaires, revente, saisonniers) | not planned — excluded |

## RÉVISION CHANTIER 1 ledger (fallbacks to rewire)

- `economy.ts` `BRIEF_INTENSITY` — essence weights by brief instead of intensity crans (Task 1).
- `data.ts` groupe voie B `pousserPowerFree` — stands in for « RINSE sans surcharge » (Task 3).
- `data.ts` lumières voie A churnMult — stands in for « burnout de foule ralenti » (Task 3).
- `data.ts` logistique voie A/B — « descente retardée, négo + » and « évacuation sans malus de rep » have no descente system yet; fallback is the heat `value` lever (Task 3).
- `data.ts` Volt `repReq: 420` — becomes « soundclash gagné » (Story D) (Task 9).
- `data.ts` Château squatté `repReq: 350` + low `heatBuild` — becomes « arc le fermier fini + rep 350 » and a real descente delay (Task 10).
