import { useEffect, useRef, type ReactNode } from 'react';
import type Decimal from 'decimal.js';
import { dec } from '../domain/calculations';
import { AppError } from '../domain/types';
import styles from '../styles/App.module.css';
export const fmt = (value: Decimal | string | null | undefined, places = 0) => {
  if (value == null) return '계산 불가';
  try { const [int, fraction] = (typeof value === 'string' ? dec(value) : value).toFixed(places).split('.'); return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : ''); } catch { return '계산 불가'; }
};
export const percentage = (value: Decimal | null) => value == null ? '계산 대상 없음' : fmt(value, 1) + '%';
export const errorMessage = (error: unknown) => error instanceof AppError ? error.message : '저장소 또는 프로그램을 처리하지 못했습니다. 기존 자료와 입력은 유지됩니다. 다시 시도해 주세요.';
export function Dialog({ label, children, onClose }: { label: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; const element = ref.current!; element.showModal(); return () => { element.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} aria-label={label} className={styles.dialog} onCancel={e => { e.preventDefault(); close.current(); }}>{children}</dialog>;
}
