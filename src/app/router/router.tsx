import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { DashboardPage } from '../../pages/Dashboard/DashboardPage';
import { CustomersPage } from '../../pages/Customers/CustomersPage';
import { CustomerDetailPage } from '../../pages/Customers/CustomerDetailPage';
import { CostCalculationPage } from '../../pages/CostCalculation/CostCalculationPage';
import { PlannedOffersPage } from '../../pages/PlannedOffers/PlannedOffersPage';
import { OfferDetailPage } from '../../pages/OfferDetail/OfferDetailPage';
import { RealizationPage } from '../../pages/Realization/RealizationPage';
import { MonthlyProfitPage } from '../../pages/MonthlyProfit/MonthlyProfitPage';
import { ChartsPage } from '../../pages/CustomerCharts/ChartsPage';
import { TariffComparisonPage } from '../../pages/TariffComparison/TariffComparisonPage';
import { ReportsPage } from '../../pages/Reports/ReportsPage';
import { SettingsPage } from '../../pages/Settings/SettingsPage';
import { PaymentCalendarPage } from '../../pages/PaymentCalendar/PaymentCalendarPage';
import { NotFoundPage } from '../../pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/:customerId', element: <CustomerDetailPage /> },
      { path: 'cost-calculation', element: <CostCalculationPage /> },
      { path: 'offers', element: <PlannedOffersPage /> },
      { path: 'offers/:offerId', element: <OfferDetailPage /> },
      { path: 'realization', element: <RealizationPage /> },
      { path: 'realization/:scenarioId', element: <RealizationPage /> },
      { path: 'monthly-profit', element: <MonthlyProfitPage /> },
      { path: 'charts', element: <ChartsPage /> },
      { path: 'comparison', element: <TariffComparisonPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'payment-calendar', element: <PaymentCalendarPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
