import { useState } from 'react';
import { Archive, ArchiveRestore, Copy, FileText, Plus, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../app/store/useAppStore';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatMoney, formatPercent } from '../../components/ui/format';

export function PlannedOffersPage() {
  const navigate = useNavigate();
  const offers = useAppStore((state) => state.offers);
  const customers = useAppStore((state) => state.customers);
  const archiveOffer = useAppStore((state) => state.archiveOffer);
  const duplicateOffer = useAppStore((state) => state.duplicateOffer);
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState('');
  const visible = offers.filter(
    (offer) =>
      (offer.status === 'archived') === archived &&
      `${offer.title} ${customers.find((customer) => customer.id === offer.customerId)?.name ?? ''}`
        .toLocaleLowerCase('tr-TR')
        .includes(query.toLocaleLowerCase('tr-TR')),
  );
  return (
    <div>
      <PageHeader
        eyebrow="PLANLANAN PORTFÖY"
        title="Planlanan teklifler"
        description="Değişmeyen teklif snapshot’larını, versiyonlarını ve finansal sonuçlarını yönetin."
        actions={
          <Link to="/cost-calculation" className="button primary">
            <Plus size={17} /> Yeni teklif
          </Link>
        }
      />
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Teklif ara"
            placeholder="Teklif veya müşteri ara"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="segmented">
          <button className={!archived ? 'active' : ''} onClick={() => setArchived(false)}>
            Aktif
          </button>
          <button className={archived ? 'active' : ''} onClick={() => setArchived(true)}>
            Arşiv
          </button>
        </div>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={archived ? 'Arşivde teklif yok' : 'Henüz nihai teklif yok'}
          description="Beş adımlı maliyet akışını tamamlayıp teklif oranını girerek ilk nihai teklifi kaydedin."
          action={
            !archived ? (
              <Link to="/cost-calculation" className="button secondary">
                Teklif oluştur
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="panel table-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Teklif</th>
                  <th>Müşteri</th>
                  <th>Durum</th>
                  <th>Brüt fatura</th>
                  <th>Net kâr</th>
                  <th>Finansman</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((offer) => (
                  <tr key={offer.id}>
                    <td>
                      <Link to={`/offers/${offer.id}`}>
                        <strong>{offer.title}</strong>
                        <small>
                          v{offer.version} · {new Date(offer.updatedAt).toLocaleDateString('tr-TR')}
                        </small>
                      </Link>
                    </td>
                    <td>
                      {customers.find((customer) => customer.id === offer.customerId)?.name ?? '—'}
                    </td>
                    <td>
                      <StatusBadge tone={offer.status === 'archived' ? 'warning' : 'positive'}>
                        {offer.status === 'archived' ? 'Arşivde' : 'Nihai'}
                      </StatusBadge>
                    </td>
                    <td>{formatMoney(offer.resultSnapshot.totals.grossInvoice)}</td>
                    <td
                      className={
                        offer.resultSnapshot.totals.netProfit >= 0
                          ? 'positive-text'
                          : 'negative-text'
                      }
                    >
                      <strong>{formatMoney(offer.resultSnapshot.totals.netProfit)}</strong>
                      <small>
                        {formatPercent(offer.resultSnapshot.totals.netProfitRate, true)}
                      </small>
                    </td>
                    <td>
                      {formatMoney(
                        offer.resultSnapshot.totals.creditCost -
                          offer.resultSnapshot.totals.valorIncome,
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label="Teklifi kopyala"
                          title="Kopyala"
                          onClick={() => {
                            duplicateOffer(offer.id);
                            navigate('/cost-calculation');
                          }}
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={archived ? 'Teklifi geri yükle' : 'Teklifi arşivle'}
                          onClick={() => void archiveOffer(offer.id, !archived)}
                        >
                          {archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
