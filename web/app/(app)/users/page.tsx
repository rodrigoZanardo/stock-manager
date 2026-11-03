import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { UserForm } from '@/components/UserForm';
import { api, currentRole } from '@/lib/api';

export default async function UsersPage() {
  // the API also refuses non-admins; this only hides a page they cannot use
  if ((await currentRole()) !== 'ADMIN') notFound();
  const [t, users] = await Promise.all([getTranslations('users'), api.users()]);
  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <section className="card p-0">
        <h2 className="px-5 pt-5 font-semibold">{t('team')}</h2>
        {users.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">{t('email')}</th>
                  <th className="th">{t('role')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="td">{u.email}</td>
                    <td className="td">{t(u.role)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <h2 className="mb-2 font-semibold">{t('newUser')}</h2>
        <p className="mb-4 text-sm text-muted">{t('subtitle')}</p>
        <UserForm />
      </section>
    </>
  );
}
