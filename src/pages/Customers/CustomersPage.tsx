import { useState, type FormEvent } from 'react';
import { Archive, ArchiveRestore, ArrowRight, Plus, Search, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../app/store/useAppStore';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';

export function CustomersPage() {
  const customers = useAppStore((state) => state.customers);
  const offers = useAppStore((state) => state.offers);
  const createCustomer = useAppStore((state) => state.createCustomer);
  const updateCustomer = useAppStore((state) => state.updateCustomer);
  const notify = useAppStore((state) => state.notify);
  const [showForm, setShowForm] = useState(false);
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ name: '', tag: '', note: '' });
  const visible = customers.filter(
    (customer) =>
      customer.isArchived === archived &&
      `${customer.name} ${customer.tag ?? ''}`
        .toLocaleLowerCase('tr-TR')
        .includes(query.toLocaleLowerCase('tr-TR')),
  );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      notify({ tone: 'error', title: 'Müşteri adı zorunludur' });
      return;
    }
    await createCustomer(form);
    setForm({ name: '', tag: '', note: '' });
    setShowForm(false);
  };
  return (
    <div>
      <PageHeader
        eyebrow="MÜŞTERİ PORTFÖYÜ"
        title="Müşteriler"
        description="Her müşterinin notlarını, kategorisini ve teklif geçmişini tek yerde yönetin."
        actions={
          <button className="button primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={17} /> Yeni müşteri
          </button>
        }
      />
      {showForm && (
        <form className="panel customer-form" onSubmit={(event) => void submit(event)}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">YENİ KAYIT</span>
              <h2>Müşteri bilgileri</h2>
            </div>
          </div>
          <div className="form-grid three">
            <label className="field">
              <span>Müşteri adı</span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                autoFocus
              />
              <small>Teklif ve raporlarda görünecek ticari unvan.</small>
            </label>
            <label className="field">
              <span>Etiket / kategori</span>
              <input
                value={form.tag}
                onChange={(event) => setForm({ ...form, tag: event.target.value })}
                placeholder="Sanayi, öncelikli…"
              />
            </label>
            <label className="field">
              <span>Müşteri notu</span>
              <input
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                placeholder="Operasyonel kısa not"
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="button ghost" onClick={() => setShowForm(false)}>
              Vazgeç
            </button>
            <button className="button primary" type="submit">
              Müşteriyi kaydet
            </button>
          </div>
        </form>
      )}
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="Müşteri ara"
            placeholder="Müşteri veya etiket ara"
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
          icon={Users}
          title={archived ? 'Arşivde müşteri yok' : 'İlk müşterinizi ekleyin'}
          description={
            archived
              ? 'Arşivlenen müşteri kayıtları burada görünür.'
              : 'Teklifler, maliyet taslakları ve gerçekleşme senaryoları bir müşteri altında saklanır.'
          }
          action={
            !archived ? (
              <button className="button secondary" onClick={() => setShowForm(true)}>
                Müşteri oluştur
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="card-grid three">
          {visible.map((customer) => {
            const customerOffers = offers.filter((offer) => offer.customerId === customer.id);
            return (
              <article className="customer-card" key={customer.id}>
                <div className="customer-card-top">
                  <span className="avatar">
                    {customer.name.slice(0, 2).toLocaleUpperCase('tr-TR')}
                  </span>
                  <StatusBadge tone={customer.isArchived ? 'warning' : 'positive'}>
                    {customer.isArchived ? 'Arşivde' : 'Aktif'}
                  </StatusBadge>
                </div>
                <h2>{customer.name}</h2>
                <p>{customer.note || 'Henüz müşteri notu eklenmedi.'}</p>
                <div className="tag-row">
                  {customer.tag && <span className="tag">{customer.tag}</span>}
                  <small>{customerOffers.length} teklif</small>
                </div>
                <div className="card-actions">
                  <Link to={`/customers/${customer.id}`} className="button ghost">
                    Detay <ArrowRight size={15} />
                  </Link>
                  <button
                    className="icon-button"
                    title={customer.isArchived ? 'Geri yükle' : 'Arşivle'}
                    aria-label={customer.isArchived ? 'Geri yükle' : 'Arşivle'}
                    onClick={() =>
                      void updateCustomer(customer.id, { isArchived: !customer.isArchived })
                    }
                  >
                    {customer.isArchived ? <ArchiveRestore size={17} /> : <Archive size={17} />}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
