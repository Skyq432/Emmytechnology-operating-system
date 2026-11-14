'use client';
// [MERGE] Period picker for Finance filter forms. Editing a date switches the
// period to "Custom" automatically, so a changed date is never ignored.
import { useState } from 'react';
import { PERIOD_OPTIONS, type Period } from '@/lib/finance/dates';
import { financeFieldClass, financeLabelClass } from './styles';

export function PeriodFields({ period }: { period: Period }) {
  const [key, setKey] = useState<string>(period.key);
  return (
    <>
      <label className={financeLabelClass}>
        Period
        <select name="period" value={key} onChange={(event) => setKey(event.target.value)} className={financeFieldClass}>
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className={financeLabelClass}>
        From
        <input type="date" name="from" defaultValue={period.from} onChange={() => setKey('custom')} className={financeFieldClass} />
      </label>
      <label className={financeLabelClass}>
        To
        <input type="date" name="to" defaultValue={period.to} onChange={() => setKey('custom')} className={financeFieldClass} />
      </label>
    </>
  );
}
