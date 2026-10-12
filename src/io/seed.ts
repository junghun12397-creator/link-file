import { parse } from 'lossless-json';
import raw from '../../프렙 카페/매장운영데이터.json?raw';
import { AppError, type Data } from '../domain/types';
import { validateData } from './validation';
export { validateData } from './validation';
export function seedData(): Data {
  const data = validateData(parse(raw, undefined, value => value));
  if (data.meta.data_class !== '가상 매장 샘플') throw new AppError('초기 자료는 가상 샘플만 사용할 수 있습니다.');
  return data;
}
