import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { deleteSupplier } from '@/app/actions';
import { ActionButton } from '@/components/ActionButton';
import { SupplierForm } from '@/components/SupplierForm';
import { api } from '@/lib/api';

const cnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

/** `?edit=<id>` opens that supplier in the form. Every web role (admin, operator) may edit; the API also checks. */
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const [{ edit }, t, suppliers] = await Promise.all([searchParams, getTranslations('suppliers'), api.suppliers()]);
  const editing = suppliers.find((s) => s.id === edit);

  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <section className="card space-y-4">
        <h2 className="font-semibold">{editing ? t('edit', { name: editing.name }) : t('new')}</h2>
        {/* key: a different supplier starts a fresh form */}
        <SupplierForm key={editing?.id ?? 'new'} supplier={editing} />
        {editing && (
          <div className="flex flex-wrap items-start gap-3">
            <Link href="/suppliers" className="btn-secondary">{t('cancelEdit')}</Link>
            <ActionButton label={t('delete')} confirm={t('deleteConfirm')} action={deleteSupplier.bind(null, editing.id)} className="btn-danger" />
          </div>
        )}
      </section>
      <section className="card p-0">
        {suppliers.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">{t('name')}</th>
                  <th className="th">{t('document')}</th>
                  <th className="th">{t('email')}</th>
                  <th className="th">{t('phone')}</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <td className="td"><Link href={`/suppliers?edit=${s.id}`} className="link">{s.name}</Link></td>
                    <td className="td font-mono text-xs">{s.document ? cnpj(s.document) : '—'}</td>
                    <td className="td">{s.email ?? '—'}</td>
                    <td className="td">{s.phone ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
