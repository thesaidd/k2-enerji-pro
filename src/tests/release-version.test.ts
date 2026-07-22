import { describe, expect, it, vi } from 'vitest';
import packageMetadata from '../../package.json';
import { APP_VERSION, DEMO_PRODUCT_NAME } from '../config/release';
import { DataPortabilityService } from '../services/storage/DataPortabilityService';

vi.mock('../services/storage/database', () => {
  const table = { toArray: vi.fn(async () => []) };
  return {
    db: {
      customers: table,
      costDrafts: table,
      plannedOffers: table,
      realizationScenarios: table,
      settings: table,
    },
  };
});

describe('release sürüm tutarlılığı', () => {
  it('paket, uygulama ve demo ürün sürümlerini aynı tutar', () => {
    expect(packageMetadata.version).toBe('3.0.3');
    expect(APP_VERSION).toBe(packageMetadata.version);
    expect(DEMO_PRODUCT_NAME).toContain(APP_VERSION);
  });

  it('backup export zarfına uygulama sürümünü yazar', async () => {
    const backup = await DataPortabilityService.export();
    expect(backup.appVersion).toBe(APP_VERSION);
  });
});
