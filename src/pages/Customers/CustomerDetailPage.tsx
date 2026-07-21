import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calculator, FileText, History } from 'lucide-react';
import { useAppStore } from '../../app/store/useAppStore';
import { EmptyState } from '../../components/ui/EmptyState';
import { MetricCard } from '../../components/ui/MetricCard';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatMoney } from '../../components/ui/format';

export function CustomerDetailPage() {
  const { customerId } = useParams();
  const customer = useAppStore((state) => state.customers.find((item) => item.id === customerId));
  const allOffers = useAppStore((state) => state.offers);
  const allDrafts = useAppStore((state) => state.costDrafts);
  const offers = allOffers.filter((offer) => offer.customerId === customerId);
  const drafts = allDrafts.filter((draft) => draft.customerId === customerId);
  const replaceDraft = useAppStore((state) => state.replaceDraft);
  if (!customer)
    return (
      <EmptyState
        icon={FileText}
        title="Müşteri bulunamadı"
        description="Kayıt silinmiş veya bu tarayıcıda bulunmuyor."
        action={
          <Link to="/customers" className="button secondary">
            Müşterilere dön
          </Link>
        }
      />
    );
  return (
    <div>
      <Link to="/customers" className="back-link">
        <ArrowLeft size={16} /> Müşteriler
      </Link>
      <PageHeader
        eyebrow={customer.tag || 'MÜŞTERİ'}
        title={customer.name}
        description={customer.note || 'Bu müşteri için not bulunmuyor.'}
        actions={
          <Link
            className="button primary"
            to="/cost-calculation"
            onClick={() =>
              replaceDraft({
                ...structuredClone(useAppStore.getState().draft),
                customerId: customer.id,
              })
            }
          >
            <Calculator size={17} /> Yeni çalışma
          </Link>
        }
      />
      <section className="metric-grid three">
        <MetricCard
          label="Teklif sayısı"
          value={String(offers.length)}
          detail={`${offers.filter((offer) => offer.status === 'final').length} aktif`}
        />
        <MetricCard
          label="Toplam planlanan fatura"
          value={formatMoney(
            offers.reduce((sum, offer) => sum + offer.resultSnapshot.totals.grossInvoice, 0),
          )}
        />
        <MetricCard
          label="Toplam net kâr"
          value={formatMoney(
            offers.reduce((sum, offer) => sum + offer.resultSnapshot.totals.netProfit, 0),
          )}
          tone="positive"
        />
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">KAYIT GEÇMİŞİ</span>
            <h2>Teklifler ve maliyet taslakları</h2>
          </div>
        </div>
        {offers.length + drafts.length === 0 ? (
          <EmptyState
            icon={History}
            title="Henüz çalışma yok"
            description="Bu müşteri için ilk maliyet taslağını oluşturun."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kayıt</th>
                  <th>Tür</th>
                  <th>Versiyon</th>
                  <th>Fatura</th>
                  <th>Net kâr</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {offers.map((offer) => (
                  <tr key={offer.id}>
                    <td>
                      <strong>{offer.title}</strong>
                    </td>
                    <td>Nihai teklif</td>
                    <td>v{offer.version}</td>
                    <td>{formatMoney(offer.resultSnapshot.totals.grossInvoice)}</td>
                    <td>{formatMoney(offer.resultSnapshot.totals.netProfit)}</td>
                    <td>
                      <Link to={`/offers/${offer.id}`} className="text-link">
                        Aç
                      </Link>
                    </td>
                  </tr>
                ))}
                {drafts.map((draft) => (
                  <tr key={draft.id}>
                    <td>
                      <strong>{draft.title}</strong>
                    </td>
                    <td>Maliyet taslağı</td>
                    <td>—</td>
                    <td>{formatMoney(draft.resultSnapshot.totals.grossInvoice)}</td>
                    <td>{formatMoney(draft.resultSnapshot.totals.netProfit)}</td>
                    <td>
                      <Link
                        to="/cost-calculation"
                        className="text-link"
                        onClick={() => replaceDraft(draft.state)}
                      >
                        Düzenle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
