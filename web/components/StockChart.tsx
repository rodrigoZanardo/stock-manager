'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Dashboard } from '@/lib/api';

export function StockChart({ data }: { data: Dashboard['daily'] }) {
  const t = useTranslations('dashboard');
  const tm = useTranslations('movements');
  const format = useFormatter();
  const label = (date: string) => format.dateTime(new Date(`${date}T00:00:00Z`), { day: '2-digit', month: 'short', timeZone: 'UTC' });

  return (
    <>
      <table className="sr-only">
        <caption>{t('chartTitle')}</caption>
        <thead>
          <tr><th scope="col">{tm('date')}</th><th scope="col">{t('in')}</th><th scope="col">{t('out')}</th></tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}><th scope="row">{label(d.date)}</th><td>{d.in}</td><td>{d.out}</td></tr>
          ))}
        </tbody>
      </table>
      {/* the table above carries the numbers for screen readers; the chart is visual only */}
      <div className="h-72" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="date" tickFormatter={label} tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip labelFormatter={(d) => label(String(d))} />
            <Legend />
            <Bar dataKey="in" name={t('in')} fill="var(--chart-in)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="out" name={t('out')} fill="var(--chart-out)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
