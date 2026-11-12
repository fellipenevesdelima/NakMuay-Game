import type { Lang } from './sim/state';
// Thai strings are AI-drafted and NOT yet reviewed by a native speaker.
type Dict = Record<string, string>;
const pt: Dict = {
  day: 'Dia', morale: 'Moral', prestige: 'Prestígio', debt: 'Dívida vence em {n} dias', rin: 'Rin, olheira',
  gate: 'O trilho emperra no meio. Me ajuda a erguer?', gateBtn: 'Erguer o portão',
  walk: 'Pode soltar, agora ele para. Dá uma volta. Onde você colocaria a primeira dupla pra treinar?', walkBtn: 'Demarcar área de treino',
  place: 'Tatame básico 3×2. Toque no piso para posicionar.', cost: 'Paga agora', after: 'Caixa após',
  confirm: 'Comprar tatame', back: 'Voltar', bad: 'Aqui não: pilar, passagem ou canaleta.',
  placed: 'Ficou bom. Agora falta quem abra o treino. Próxima cena: contratar o primeiro coach.',
  reset: 'Nova carreira', fictional: 'Valores fictícios',
};
const en: Dict = {
  day: 'Day', morale: 'Morale', prestige: 'Prestige', debt: 'Debt due in {n} days', rin: 'Rin, scout',
  gate: 'The track jams halfway. Help me lift it?', gateBtn: 'Lift the shutter',
  walk: 'You can let go, it holds now. Take a walk. Where would you put the first pair to train?', walkBtn: 'Mark training area',
  place: 'Basic 3×2 mat. Tap the floor to position it.', cost: 'Pay now', after: 'Cash after',
  confirm: 'Buy mat', back: 'Back', bad: 'Not here: pillar, passage or gutter.',
  placed: 'Looks right. Now we need someone to open training. Next scene: hire the first coach.',
  reset: 'New career', fictional: 'Fictional values',
};
const th: Dict = {
  day: 'วันที่', morale: 'ขวัญกำลังใจ', prestige: 'บารมี', debt: 'หนี้ครบกำหนดใน {n} วัน', rin: 'ริน แมวมอง',
  gate: 'รางประตูติดตรงกลาง ช่วยยกหน่อยได้ไหม', gateBtn: 'ยกประตูขึ้น',
  walk: 'ปล่อยได้แล้ว มันค้างอยู่ ลองเดินดูรอบ ๆ คุณจะให้คู่แรกซ้อมตรงไหน', walkBtn: 'กำหนดพื้นที่ซ้อม',
  place: 'เบาะซ้อมพื้นฐาน 3×2 แตะพื้นเพื่อวางตำแหน่ง', cost: 'จ่ายตอนนี้', after: 'เงินสดหลังซื้อ',
  confirm: 'ซื้อเบาะ', back: 'กลับ', bad: 'ตรงนี้วางไม่ได้: เสา ทางเดิน หรือรางน้ำ',
  placed: 'ดูดีแล้ว ต่อไปต้องหาคนเปิดการซ้อม ฉากต่อไป: จ้างครูมวยคนแรก',
  reset: 'เริ่มใหม่', fictional: 'ตัวเลขสมมติ',
};
const all: Record<Lang, Dict> = { pt, en, th };
const locale: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US', th: 'th-TH' };
export const t = (lang: Lang, key: string, vars: Record<string, string | number> = {}) =>
  (all[lang][key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
export const baht = (lang: Lang, n: number) => '฿' + new Intl.NumberFormat(locale[lang]).format(n);
export const nextLang = (l: Lang): Lang => (l === 'pt' ? 'en' : l === 'en' ? 'th' : 'pt');
