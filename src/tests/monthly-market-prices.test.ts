import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../config/defaults';
import {
  normalizeMonthlyMarketPrices,
  resolveForecastMarketPrices,
} from '../domain/market-prices/marketPrices';
import { calculateOffer } from '../domain/profitability/calculation';
import { calculateRealization } from '../domain/realization/realization';
import {
  DataPortabilityService,
  normalizeBackupPayload,
} from '../services/storage/DataPortabilityService';
import { db } from '../services/storage/database';
import { normalizeAppSettings, SettingsRepository } from '../services/storage/SettingsRepository';
import { oneMwhState } from './helpers';
import type { AppSettings, MonthlyMarketPrice, PlannedOffer, RealizationScenario } from '../types';

const prices = (patch: Partial<MonthlyMarketPrice>[] = []): MonthlyMarketPrice[] =>
  ['2026-07', '2026-08'].map((month, index) => ({
    month,
    forecastPtfTlMwh: index === 0 ? 3200 : 3450,
    actualPtfTlMwh: index === 0 ? 3300 : 3500,
    forecastYekdemTlMwh: index === 0 ? 400 : 430,
    actualYekdemTlMwh: index === 0 ? 410 : 440,
    sourceNote: 'EPİAŞ test verisi',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...patch[index],
  }));

const multiMonthState = () =>
  oneMwhState({
    usageStart: '2026-07-01',
    usageEnd: '2026-08-31',
    monthlyConsumption: 31,
    offerRate: 10,
    creditRate: 0,
    valorRate: 0,
  });

const plannedOffer = (marketPrices = prices()): PlannedOffer => {
  const result = calculateOffer(multiMonthState(), [], marketPrices);
  return {
    id: 'offer_1',
    recordType: 'planned_offer',
    customerId: 'customer_1',
    version: 1,
    title: 'Aylık fiyatlı teklif',
    status: 'final',
    stateSnapshot: result.state,
    paymentPlanSnapshot: result.state.paymentPlan,
    resultSnapshot: result,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
};

afterEach(() => vi.restoreAllMocks());

describe('aylık piyasa verisi kalıcılığı ve doğrulaması', () => {
  it('settings repository aylık piyasa verilerini güvenli biçimde saklayıp yükler', async () => {
    const settings = { ...structuredClone(DEFAULT_SETTINGS), monthlyMarketPrices: prices() };
    const put = vi.spyOn(db.settings, 'put').mockReturnValue(Promise.resolve('app') as never);
    vi.spyOn(db.settings, 'get').mockReturnValue(Promise.resolve(settings) as never);

    await SettingsRepository.save(settings);
    const loaded = await SettingsRepository.get();

    expect(put).toHaveBeenCalledWith(settings);
    expect(loaded.monthlyMarketPrices).toEqual(prices());
  });

  it('aynı ayın ikinci kez eklenmesini reddeder', () => {
    expect(() => normalizeMonthlyMarketPrices([prices()[0], prices()[0]])).toThrow(
      'yalnız bir kez',
    );
  });

  it('eski settings kaydında aylık fiyat yoksa boş diziye döner', () => {
    const legacy = structuredClone(DEFAULT_SETTINGS) as Partial<AppSettings>;
    delete legacy.monthlyMarketPrices;
    expect(normalizeAppSettings(legacy).monthlyMarketPrices).toEqual([]);
  });

  it('backup ve restore normalizasyonunda fiyat kayıtlarını korur', () => {
    const normalized = normalizeBackupPayload({
      version: 'K2-ENERJIPRO-3.0',
      exportedAt: '2026-07-01',
      customers: [],
      costDrafts: [],
      plannedOffers: [],
      realizationScenarios: [],
      settings: [{ ...structuredClone(DEFAULT_SETTINGS), monthlyMarketPrices: prices() }],
    });
    expect(normalized.settings[0]!.monthlyMarketPrices).toEqual(prices());
  });

  it('restore doğrulanmış aylık fiyatları settings tablosuna yazar', async () => {
    const clearMocks = [
      vi.spyOn(db.customers, 'clear').mockReturnValue(Promise.resolve() as never),
      vi.spyOn(db.costDrafts, 'clear').mockReturnValue(Promise.resolve() as never),
      vi.spyOn(db.plannedOffers, 'clear').mockReturnValue(Promise.resolve() as never),
      vi.spyOn(db.realizationScenarios, 'clear').mockReturnValue(Promise.resolve() as never),
      vi.spyOn(db.settings, 'clear').mockReturnValue(Promise.resolve() as never),
    ];
    vi.spyOn(db.customers, 'bulkPut').mockReturnValue(Promise.resolve('') as never);
    vi.spyOn(db.costDrafts, 'bulkPut').mockReturnValue(Promise.resolve('') as never);
    vi.spyOn(db.plannedOffers, 'bulkPut').mockReturnValue(Promise.resolve('') as never);
    vi.spyOn(db.realizationScenarios, 'bulkPut').mockReturnValue(Promise.resolve('') as never);
    const settingsBulkPut = vi
      .spyOn(db.settings, 'bulkPut')
      .mockReturnValue(Promise.resolve('app') as never);
    vi.spyOn(db, 'transaction').mockImplementation(
      ((...args: unknown[]) => (args.at(-1) as () => Promise<void>)()) as never,
    );

    await DataPortabilityService.restore({
      version: 'K2-ENERJIPRO-3.0',
      exportedAt: '2026-07-01',
      customers: [],
      costDrafts: [],
      plannedOffers: [],
      realizationScenarios: [],
      settings: [{ ...structuredClone(DEFAULT_SETTINGS), monthlyMarketPrices: prices() }],
    });

    expect(clearMocks.every((mock) => mock.mock.calls.length === 1)).toBe(true);
    expect(settingsBulkPut).toHaveBeenCalledWith([
      expect.objectContaining({ monthlyMarketPrices: prices() }),
    ]);
  });

  it('negatif PTF değerini kabul eder, negatif YEKDEM değerini reddeder', () => {
    expect(normalizeMonthlyMarketPrices(prices([{ forecastPtfTlMwh: -250 }]))[0])
      .toMatchObject({ forecastPtfTlMwh: -250 });
    expect(() =>
      normalizeMonthlyMarketPrices(prices([{ forecastYekdemTlMwh: -1 }])),
    ).toThrow();
  });
});

describe('planlanan teklif aylık fiyat çözümlemesi', () => {
  it('temmuz ve ağustos tahminlerini farklı dönemlerde kullanır', () => {
    const result = calculateOffer(multiMonthState(), [], prices());
    expect(result.valid).toBe(true);
    expect(result.periods.map((period) => period.ptfUnitPrice)).toEqual([3200, 3450]);
    expect(result.periods.map((period) => period.yekdemUnitPrice)).toEqual([400, 430]);
    expect(result.periods.every((period) => period.ptfPriceSource === 'forecast')).toBe(true);
  });

  it('tahmini PTF eksikse nihai hesap sonucunu engeller', () => {
    const result = calculateOffer(multiMonthState(), [], prices([{}, { forecastPtfTlMwh: null }]));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('- 2026-08: Tahmini PTF');
  });

  it('tahmini YEKDEM eksikse nihai hesap sonucunu engeller', () => {
    const result = calculateOffer(multiMonthState(), [], prices([{ forecastYekdemTlMwh: null }]));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('- 2026-07: Tahmini YEKDEM');
  });

  it('kaydedilmiş snapshot ayarlar değişince değişmez, yeni hesap güncel tahmini kullanır', () => {
    const initial = prices();
    const saved = structuredClone(calculateOffer(multiMonthState(), [], initial));
    const updated = prices([{ forecastPtfTlMwh: 3900 }]);
    const current = calculateOffer(multiMonthState(), [], updated);

    expect(saved.periods[0]!.ptfUnitPrice).toBe(3200);
    expect(saved.marketPriceSnapshot?.[0]?.ptfUnitPrice).toBe(3200);
    expect(current.periods[0]!.ptfUnitPrice).toBe(3900);
  });

  it('çok aylı teklif toplamlarını dönem toplamlarıyla mutabık tutar', () => {
    const result = calculateOffer(multiMonthState(), [], prices());
    expect(result.totals.ptfAmount).toBeCloseTo(
      result.periods.reduce((sum, period) => sum + period.ptfAmount, 0),
      8,
    );
    expect(result.totals.yekdemAmount).toBeCloseTo(
      result.periods.reduce((sum, period) => sum + period.yekdemAmount, 0),
      8,
    );
    expect(result.totals.grossInvoice).toBeCloseTo(
      result.periods.reduce((sum, period) => sum + period.grossInvoice, 0),
      8,
    );
  });

  it('parametresiz eski kayıt yolunda legacy fiyatları korur', () => {
    const resolution = resolveForecastMarketPrices(['2026-07'], undefined, 1234, 321);
    expect(resolution.values[0]).toMatchObject({
      ptfUnitPrice: 1234,
      yekdemUnitPrice: 321,
      ptfPriceSource: 'legacy',
    });
  });
});

describe('gerçekleşen aylık fiyat çözümlemesi', () => {
  const scenarioFor = (offer: PlannedOffer): Omit<RealizationScenario, 'resultSnapshot'> => ({
    id: 'scenario_1',
    sourceCustomerId: offer.customerId,
    sourceOfferId: offer.id,
    sourceOfferVersion: offer.version,
    sourceOfferSnapshot: structuredClone(offer),
    name: 'Gerçekleşen',
    asOfDate: '2026-08-31',
    periodOverrides: [],
    actualPayments: [],
    createdAt: '2026-07-01',
    updatedAt: '2026-07-01',
  });

  it('gerçekleşen değerler mevcutsa dönemlerde actual fiyatları kullanır', () => {
    const offer = plannedOffer();
    const result = calculateRealization(scenarioFor(offer), 5.55, prices());
    expect(result.periods.map((period) => period.ptfUnitPrice)).toEqual([3300, 3500]);
    expect(result.periods.map((period) => period.yekdemUnitPrice)).toEqual([410, 440]);
    expect(result.periods.every((period) => period.ptfPriceSource === 'actual')).toBe(true);
  });

  it('actual değer eksikse teklif snapshot tahminine düşer ve görünür uyarı üretir', () => {
    const marketPrices = prices([{}, { actualYekdemTlMwh: null }]);
    const offer = plannedOffer(marketPrices);
    const result = calculateRealization(scenarioFor(offer), 5.55, marketPrices);
    const august = result.periods[1]!;
    expect(august.yekdemUnitPrice).toBe(430);
    expect(august.yekdemPriceSource).toBe('forecast');
    expect(result.marketPriceWarnings?.join(' ')).toContain('2026-08 gerçekleşen YEKDEM girilmedi');
  });

  it('gelecek ayın girilmiş actual değerini kullanmaz', () => {
    const offer = plannedOffer();
    const scenario = { ...scenarioFor(offer), asOfDate: '2026-07-31' };
    const result = calculateRealization(scenario, 5.55, prices());
    expect(result.periods[1]).toMatchObject({
      ptfUnitPrice: 3450,
      yekdemUnitPrice: 430,
      ptfPriceSource: 'forecast',
      yekdemPriceSource: 'forecast',
    });
    expect(result.marketPriceWarnings?.join(' ')).toContain(
      '2026-08 henüz gerçekleşme döneminde değil',
    );
  });

  it('manuel senaryo fiyatını actual değerin önünde kullanır', () => {
    const offer = plannedOffer();
    const scenario = scenarioFor(offer);
    scenario.periodOverrides = [
      {
        periodId: offer.resultSnapshot.periods[0]!.id,
        ptfUnitPrice: -100,
        yekdemUnitPrice: 125,
      },
    ];
    const result = calculateRealization(scenario, 5.55, prices());
    expect(result.periods[0]).toMatchObject({
      ptfUnitPrice: -100,
      yekdemUnitPrice: 125,
      ptfPriceSource: 'manual_override',
      yekdemPriceSource: 'manual_override',
    });
  });

  it('gerçekleşme fiyatı değişikliğinde kaynak planlanan teklifi değiştirmez', () => {
    const offer = plannedOffer();
    const before = JSON.stringify(offer);
    calculateRealization(scenarioFor(offer), 5.55, prices([{ actualPtfTlMwh: 9999 }]));
    expect(JSON.stringify(offer)).toBe(before);
  });
});
