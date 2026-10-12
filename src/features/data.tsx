import { useRef, useState, type ChangeEvent } from 'react';
import { Dialog, errorMessage } from '../app/ui';
import { backupFileName, dataDescription, decodeBackup, encodeBackup, type Backup } from '../io/backup';
import type { Snapshot } from '../domain/types';
import { db, restoreBackup } from '../storage/store';
import styles from '../styles/App.module.css';

export function DataTools({ onSaved }: { onSaved: (s: Snapshot) => void }) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [restore, setRestore] = useState<{ expected: Snapshot; backup: Backup; request: string; name: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const backup = async () => {
    if (busy) return; setBusy(true); setError(''); setMessage('백업 파일을 준비하고 있습니다…');
    let url: string | undefined;
    try {
      const current = await db.datasets.get('active'); if (!current) throw new Error('missing');
      const content = encodeBackup(current), filename = backupFileName();
      url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
      const downloadUrl = url; window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000); url = undefined;
      setMessage(`내려받기를 시작했습니다: ${filename}. 기기에 파일이 저장됐는지는 다운로드 목록에서 확인하세요. 저장된 원장만 포함하며 미저장 초안은 제외합니다.`);
    } catch (e) { setMessage(''); setError(errorMessage(e)); } finally { if (url) URL.revokeObjectURL(url); setBusy(false); }
  };
  const select = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file || busy) return;
    setBusy(true); setRestore(undefined); setError(''); setMessage(`파일 ${file.name} (${file.size.toLocaleString()}바이트) 검사 중${file.size > 10000000 ? ' · 큰 파일은 시간이 걸릴 수 있습니다.' : '…'}`);
    try {
      if (!file.size) throw new Error('empty');
      const expected = await db.datasets.get('active'); if (!expected) throw new Error('missing');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      const decoded = decodeBackup(text); setRestore({ expected, backup: decoded, request: crypto.randomUUID(), name: file.name }); setMessage('');
    } catch (e) { setMessage(''); setError(file.size === 0 ? '0바이트 파일입니다. 기존 자료는 유지합니다.' : e instanceof TypeError ? 'UTF-8 파일을 읽지 못했습니다. 기존 자료는 유지합니다.' : errorMessage(e)); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!restore || busy) return; setBusy(true); setError('');
    try { const result = await restoreBackup(db, restore.expected, restore.request, restore.backup.data, true); setRestore(undefined); setMessage('전체 복원이 실제 저장되었습니다. 기록·수익성·손익·잔량을 다시 집계했습니다.'); onSaved(result); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const cancel = () => { if (!busy) { setRestore(undefined); setError(''); setMessage('복원을 취소했습니다. 기존 전체 기록은 바뀌지 않았습니다.'); } };
  return <section className={styles.tableCard} aria-label="전체 백업과 복원"><div className={styles.tableHeading}><h2>전체 백업·복원</h2><span>이 브라우저 자료를 파일로 보관</span></div><div className={styles.confirmBody}><p>백업은 전체 판매·비용·재고·메뉴·재료·레시피·가격·달력·설정을 담은 JSON 파일입니다. 엑셀 가져오기와는 다릅니다.</p><p>파일은 암호화되지 않습니다. 보호된 폴더 등에 따로 보관하고 GitHub에 올리지 마세요. 다른 기기·브라우저·주소는 자동 공유되지 않으며, 이동 전 기존 주소에서 백업해야 합니다.</p><div className={styles.toolbar}><button className={styles.primary} disabled={busy} onClick={() => void backup()}>전체 백업 내려받기</button><button disabled={busy} onClick={() => fileRef.current?.click()}>백업 파일로 복원</button><input ref={fileRef} type="file" accept=".json,application/json" aria-label="복원할 백업 파일" style={{ display: 'none' }} onChange={e => void select(e)} disabled={busy}/></div>{message && <p role="status" className={styles.info}>{message}</p>}{error && !restore && <p role="alert" className={styles.error}>{error}</p>}<p className={styles.subtle}>브라우저 자료 삭제·기기 고장·비공개 창의 종료에 대비해 파일을 별도 보관하세요. 백업 파일 생성 자체는 원장 변경이 아닙니다.</p></div>
    {restore && <Dialog label="전체 복원 확인" onClose={cancel}><header className={styles.dialogHeader}><h2>현재 전체 자료를 교체할까요?</h2></header><div className={styles.confirmBody}><p>선택 파일: {restore.name}</p><p>백업 생성: {new Date(restore.backup.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (한국 시간)</p><p>현재: {dataDescription(restore.expected.data)}</p><p>복원: {dataDescription(restore.backup.data)}</p><p>출처: {String(restore.backup.data.meta.source || restore.backup.data.meta.dataset_id || '기록 없음')} · 원본 자료기간 {restore.backup.data.meta.start_date}~{restore.backup.data.meta.as_of}</p><p className={styles.error}>추가·병합이 아닙니다. 백업 이후 입력한 기록은 교체로 사라집니다. 먼저 현재 자료를 백업하는 것을 권합니다.</p>{!restore.backup.data.sales.length && !restore.backup.data.expenses.length && !restore.backup.data.inventory_events.length && <p className={styles.error}>활동 기록 없음으로 전체 대체합니다. 현재 판매·비용·재고 활동 기록이 모두 제거됩니다.</p>}{error && <p role="alert" className={styles.error}>{error}</p>}</div><footer className={styles.dialogFooter}><button disabled={busy} onClick={cancel}>취소</button><button disabled={busy} className={styles.danger} onClick={() => void confirm()}>{busy ? '전체 복원 저장 중…' : '전체 대체 복원 확인'}</button></footer></Dialog>}
  </section>;
}
