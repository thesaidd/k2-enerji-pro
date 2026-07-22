import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  BarChart3,
  CalendarRange,
  Calculator,
  ChartNoAxesCombined,
  FileChartColumn,
  Gauge,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  Sun,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { useAppStore } from '../../app/store/useAppStore';
import { CALCULATION_POLICY_VERSION } from '../../config/calculationPolicy';
import { APP_VERSION, DEMO_PRODUCT_NAME } from '../../config/release';
import { ToastRegion } from '../feedback/ToastRegion';
import { SaveStatus } from './SaveStatus';

const navItems = [
  { to: '/', label: 'Gösterge Paneli', icon: Gauge },
  { to: '/customers', label: 'Müşteriler', icon: Users },
  { to: '/cost-calculation', label: 'Maliyet Hesaplama', icon: Calculator },
  { to: '/offers', label: 'Planlanan Teklifler', icon: WalletCards },
  { to: '/realization', label: 'Gerçekleşme Simülasyonu', icon: ReceiptText },
  { to: '/payment-calendar', label: 'Ödeme / Kullanım Takvimi', icon: CalendarRange },
  { to: '/monthly-profit', label: 'Aylık Kâr', icon: BarChart3 },
  { to: '/charts', label: 'Grafikler', icon: ChartNoAxesCombined },
  { to: '/comparison', label: 'Tarife Karşılaştırması', icon: FileChartColumn },
  { to: '/reports', label: 'Raporlar', icon: FileChartColumn },
  { to: '/settings', label: 'Ayarlar', icon: Settings },
];

export function AppLayout() {
  const loadAll = useAppStore((state) => state.loadAll);
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    void loadAll();
  }, [loadAll]);
  useEffect(() => {
    const dark =
      settings.theme === 'dark' ||
      (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [settings.theme]);
  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">K2</span>
          <div>
            <strong>ENERJİPRO</strong>
            <small>3.0 · Demo</small>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Menüyü kapat"
          >
            <X />
          </button>
        </div>
        <nav aria-label="Ana menü">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileOpen(false)}>
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span>v{APP_VERSION}</span>
          <small>Politika: {CALCULATION_POLICY_VERSION}</small>
        </div>
      </aside>
      <div className="app-main">
        <div className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button desktop-collapse"
              onClick={() => setCollapsed(!collapsed)}
              aria-label="Yan menüyü daralt"
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </button>
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Menüyü aç"
            >
              <Menu />
            </button>
            <SaveStatus />
          </div>
          <button
            className="theme-toggle"
            onClick={() =>
              void updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
            }
            aria-label="Temayı değiştir"
          >
            {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span>{settings.theme === 'dark' ? 'Açık tema' : 'Koyu tema'}</span>
          </button>
        </div>
        <div className="demo-banner">
          <strong>{DEMO_PRODUCT_NAME}</strong>
          <span>Yerel tarayıcı verisi kullanır. Resmî fatura veya muhasebe sistemi değildir.</span>
        </div>
        <main className="content">
          <Outlet />
        </main>
      </div>
      <ToastRegion />
    </div>
  );
}
