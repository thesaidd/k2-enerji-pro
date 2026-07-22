import { create } from 'zustand';
import { DEFAULT_OFFER_STATE, DEFAULT_SETTINGS } from '../../config/defaults';
import { createId } from '../../config/paymentPlans';
import { calculateOffer } from '../../domain/profitability/calculation';
import { calculateRealization } from '../../domain/realization/realization';
import { CustomerRepository } from '../../services/storage/CustomerRepository';
import { CostDraftRepository } from '../../services/storage/CostDraftRepository';
import { PlannedOfferRepository } from '../../services/storage/PlannedOfferRepository';
import { RealizationScenarioRepository } from '../../services/storage/RealizationScenarioRepository';
import { SettingsRepository } from '../../services/storage/SettingsRepository';
import type {
  AppSettings,
  CostDraft,
  Customer,
  OfferState,
  PlannedOffer,
  RealizationScenario,
  MonthlyMarketPrice,
} from '../../types';
import type { MigrationPreview } from '../../services/migration/migrate217';
import { mergeMigratedSettings } from '../../services/migration/migrate217';

export interface ToastMessage {
  id: string;
  tone: 'success' | 'error' | 'warning' | 'info';
  title: string;
  detail?: string;
}

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface AppStore {
  ready: boolean;
  customers: Customer[];
  costDrafts: CostDraft[];
  offers: PlannedOffer[];
  scenarios: RealizationScenario[];
  settings: AppSettings;
  draft: OfferState;
  saveStatus: SaveStatus;
  lastSavedAt?: string;
  toasts: ToastMessage[];
  loadAll: () => Promise<void>;
  setDraft: (patch: Partial<OfferState>) => void;
  replaceDraft: (state: OfferState) => void;
  resetDraft: (customerId?: string) => void;
  createCustomer: (input: Pick<Customer, 'name' | 'note' | 'tag'>) => Promise<Customer>;
  updateCustomer: (
    id: string,
    patch: Partial<Pick<Customer, 'name' | 'note' | 'tag' | 'isArchived'>>,
  ) => Promise<void>;
  saveCostDraft: () => Promise<CostDraft>;
  savePlannedOffer: (parentOfferId?: string) => Promise<PlannedOffer>;
  archiveOffer: (id: string, archived?: boolean) => Promise<void>;
  duplicateOffer: (id: string) => void;
  saveScenario: (scenario: RealizationScenario) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  saveMonthlyMarketPrices: (prices: MonthlyMarketPrice[]) => Promise<void>;
  applyMigration: (preview: MigrationPreview) => Promise<void>;
  notify: (message: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const now = (): string => new Date().toISOString();
const upsert = <T extends { id: string }>(items: T[], item: T): T[] => [
  item,
  ...items.filter((current) => current.id !== item.id),
];

export const useAppStore = create<AppStore>((set, get) => ({
  ready: false,
  customers: [],
  costDrafts: [],
  offers: [],
  scenarios: [],
  settings: structuredClone(DEFAULT_SETTINGS),
  draft: structuredClone(DEFAULT_OFFER_STATE),
  saveStatus: 'idle',
  toasts: [],

  loadAll: async () => {
    const [customers, costDrafts, offers, scenarios, settings] = await Promise.all([
      CustomerRepository.list(),
      CostDraftRepository.list(),
      PlannedOfferRepository.list(),
      RealizationScenarioRepository.list(),
      SettingsRepository.get(),
    ]);
    set({ customers, costDrafts, offers, scenarios, settings, ready: true });
  },

  setDraft: (patch) =>
    set((state) => ({ draft: { ...state.draft, ...patch }, saveStatus: 'dirty' })),
  replaceDraft: (draft) => set({ draft: structuredClone(draft), saveStatus: 'idle' }),
  resetDraft: (customerId = '') =>
    set({ draft: { ...structuredClone(DEFAULT_OFFER_STATE), customerId }, saveStatus: 'idle' }),

  createCustomer: async (input) => {
    set({ saveStatus: 'saving' });
    const timestamp = now();
    const customer: Customer = {
      id: createId('customer'),
      name: input.name.trim(),
      note: input.note?.trim(),
      tag: input.tag?.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
      isArchived: false,
    };
    await CustomerRepository.save(customer);
    set((state) => ({
      customers: upsert(state.customers, customer),
      draft: { ...state.draft, customerId: customer.id },
      saveStatus: 'saved',
      lastSavedAt: timestamp,
    }));
    get().notify({
      tone: 'success',
      title: 'Müşteri kaydedildi',
      detail: `${customer.name} · ${new Date(timestamp).toLocaleString('tr-TR')}`,
    });
    return customer;
  },

  updateCustomer: async (id, patch) => {
    const customer = get().customers.find((item) => item.id === id);
    if (!customer) throw new Error('Müşteri bulunamadı.');
    const updated = { ...customer, ...patch, updatedAt: now() };
    await CustomerRepository.save(updated);
    set((state) => ({
      customers: upsert(state.customers, updated),
      saveStatus: 'saved',
      lastSavedAt: updated.updatedAt,
    }));
    get().notify({
      tone: 'success',
      title: updated.isArchived ? 'Müşteri arşivlendi' : 'Müşteri kaydedildi',
      detail: updated.name,
    });
  },

  saveCostDraft: async () => {
    set({ saveStatus: 'saving' });
    const state = structuredClone(get().draft);
    const referenceState = { ...state, offerRate: 0 };
    const result = calculateOffer(
      referenceState,
      get().settings.holidays,
      get().settings.monthlyMarketPrices,
      get().settings.tariffVersions,
    );
    const onlyMarketPricesMissing =
      result.errors[0] === 'Aşağıdaki dönemlerin piyasa tahmini eksik:';
    const tariffDraftError =
      result.errors.length > 0 &&
      result.errors.every((error) =>
        /tarife|override nedeni/i.test(error),
      );
    if (!result.valid && !onlyMarketPricesMissing && !tariffDraftError) {
      set({ saveStatus: 'error' });
      throw new Error(result.errors.join(' '));
    }
    const timestamp = now();
    const draft: CostDraft = {
      id: createId('cost_draft'),
      recordType: 'cost_draft',
      customerId: state.customerId,
      title: state.title,
      state,
      paymentPlan: structuredClone(state.paymentPlan),
      resultSnapshot: result,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await CostDraftRepository.save(draft);
    set((current) => ({
      costDrafts: upsert(current.costDrafts, draft),
      saveStatus: 'saved',
      lastSavedAt: timestamp,
    }));
    get().notify({
      tone: 'success',
      title: 'Maliyet taslağı kaydedildi',
      detail: `${draft.title} · ${new Date(timestamp).toLocaleString('tr-TR')}`,
    });
    return draft;
  },

  savePlannedOffer: async (parentOfferId) => {
    set({ saveStatus: 'saving' });
    const state = structuredClone(get().draft);
    if (!state.customerId) {
      set({ saveStatus: 'error' });
      throw new Error('Nihai teklif için müşteri zorunludur.');
    }
    if (state.offerRate == null || !Number.isFinite(state.offerRate)) {
      set({ saveStatus: 'error' });
      throw new Error('Nihai teklif için teklif oranı zorunludur.');
    }
    const result = calculateOffer(
      state,
      get().settings.holidays,
      get().settings.monthlyMarketPrices,
      get().settings.tariffVersions,
    );
    if (!result.valid) {
      set({ saveStatus: 'error' });
      throw new Error(result.errors.join(' '));
    }
    const parent = parentOfferId
      ? get().offers.find((offer) => offer.id === parentOfferId)
      : undefined;
    const timestamp = now();
    const version = parent
      ? Math.max(
          ...get()
            .offers.filter((offer) => offer.parentOfferId === parent.id || offer.id === parent.id)
            .map((offer) => offer.version),
          parent.version,
        ) + 1
      : 1;
    const offer: PlannedOffer = {
      id: createId('offer'),
      recordType: 'planned_offer',
      customerId: state.customerId,
      version,
      parentOfferId: parent?.parentOfferId ?? parent?.id,
      title: state.title,
      status: 'final',
      stateSnapshot: structuredClone(state),
      paymentPlanSnapshot: structuredClone(state.paymentPlan),
      resultSnapshot: structuredClone(result),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await PlannedOfferRepository.save(offer);
    set((current) => ({
      offers: upsert(current.offers, offer),
      saveStatus: 'saved',
      lastSavedAt: timestamp,
    }));
    const customer = get().customers.find((item) => item.id === offer.customerId);
    get().notify({
      tone: 'success',
      title: parent ? 'Teklif versiyonu oluşturuldu' : 'Nihai teklif kaydedildi',
      detail: `${customer?.name ?? 'Müşteri'} · ${offer.title} · ${new Date(timestamp).toLocaleString('tr-TR')}`,
    });
    return offer;
  },

  archiveOffer: async (id, archived = true) => {
    const offer = get().offers.find((item) => item.id === id);
    if (!offer) return;
    const updated: PlannedOffer = {
      ...offer,
      status: archived ? 'archived' : 'final',
      updatedAt: now(),
    };
    await PlannedOfferRepository.save(updated);
    set((state) => ({ offers: upsert(state.offers, updated) }));
    get().notify({
      tone: 'success',
      title: archived ? 'Teklif arşivlendi' : 'Teklif geri yüklendi',
      detail: offer.title,
    });
  },

  duplicateOffer: (id) => {
    const offer = get().offers.find((item) => item.id === id);
    if (!offer) return;
    set({
      draft: { ...structuredClone(offer.stateSnapshot), title: `${offer.title} · Kopya` },
      saveStatus: 'dirty',
    });
    get().notify({
      tone: 'info',
      title: 'Teklif kopyası düzenlemeye açıldı',
      detail:
        'Kaynak teklif değişmez; yeni kayıt güncel aylık piyasa tahminleriyle hesaplanır.',
    });
  },

  saveScenario: async (scenario) => {
    set({ saveStatus: 'saving' });
    const updated = {
      ...structuredClone(scenario),
      resultSnapshot: calculateRealization(
        scenario,
        get().settings.lateFee.monthlyRate,
        get().settings.monthlyMarketPrices,
        get().settings.holidays,
      ),
      updatedAt: now(),
    };
    await RealizationScenarioRepository.save(updated);
    set((state) => ({
      scenarios: upsert(state.scenarios, updated),
      saveStatus: 'saved',
      lastSavedAt: updated.updatedAt,
    }));
    get().notify({
      tone: 'success',
      title: 'Gerçekleşme senaryosu kaydedildi',
      detail: `${updated.name} · ${new Date(updated.updatedAt).toLocaleString('tr-TR')}`,
    });
  },

  updateSettings: async (patch) => {
    const settings = {
      ...get().settings,
      ...patch,
      lateFee: { ...get().settings.lateFee, ...(patch.lateFee ?? {}) },
    };
    const saved = await SettingsRepository.save(settings);
    set({ settings: saved });
    get().notify({ tone: 'success', title: 'Ayarlar kaydedildi' });
  },

  saveMonthlyMarketPrices: async (prices) => {
    set({ saveStatus: 'saving' });
    get().notify({ tone: 'info', title: 'Kaydediliyor…' });
    try {
      const settings = await SettingsRepository.save({
        ...get().settings,
        monthlyMarketPrices: prices,
      });
      const timestamp = now();
      set({ settings, saveStatus: 'saved', lastSavedAt: timestamp });
      get().notify({ tone: 'success', title: 'Piyasa verileri başarıyla kaydedildi' });
    } catch (error) {
      set({ saveStatus: 'error' });
      get().notify({
        tone: 'error',
        title: 'Hata oluştu',
        detail: error instanceof Error ? error.message : 'Piyasa verileri kaydedilemedi.',
      });
      throw error;
    }
  },

  applyMigration: async (preview) => {
    await Promise.all([
      CustomerRepository.saveMany(preview.payload.customers),
      PlannedOfferRepository.saveMany(preview.payload.offers),
      SettingsRepository.save(mergeMigratedSettings(get().settings, preview.payload.holidays)),
    ]);
    await get().loadAll();
    get().notify({
      tone: 'success',
      title: '2.17 verileri içe aktarıldı',
      detail: `${preview.customers} müşteri · ${preview.offers} teklif`,
    });
  },

  notify: (message) => {
    const toast = { ...message, id: createId('toast') };
    set((state) => ({ toasts: [...state.toasts, toast] }));
    window.setTimeout(() => get().dismissToast(toast.id), 6000);
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
