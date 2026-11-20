// Capas da missa (slides e PDF das cifras): uma para cada tempo litúrgico e para os dias de festa, desenhadas aqui
// mesmo em SVG (sem imagem de fora). A automática escolhe pelo nome da festa (Natal, Páscoa, Cristo Rei, Nossa Senhora...)
// e, se não for festa, pelo tempo litúrgico da missa. Cada capa traz também as cores dos slides daquele tempo.

export const CAPAS = [
  { id: 'advento', nome: 'Advento', fundo: ['#1f0d33', '#4f2475'], texto: '#ffffff', destaque: '#f2c14e', suave: '#d9c8ec', simbolo: 'coroa' },
  { id: 'natal', nome: 'Natal', fundo: ['#fffaf0', '#ecd9a8'], texto: '#3a2a10', destaque: '#b8860b', suave: '#7a6a4a', simbolo: 'estrela', claro: true },
  { id: 'quaresma', nome: 'Quaresma', fundo: ['#170b26', '#3f2453'], texto: '#ffffff', destaque: '#c9a7e4', suave: '#cbbbd8', simbolo: 'cruz' },
  { id: 'semana-santa', nome: 'Semana Santa', fundo: ['#200406', '#62101a'], texto: '#ffffff', destaque: '#e9b8a4', suave: '#e5c2c2', simbolo: 'espinhos' },
  { id: 'pascoa', nome: 'Tempo Pascal', fundo: ['#fffdf6', '#f3e2ad'], texto: '#3a2a10', destaque: '#c39a1c', suave: '#7a6a4a', simbolo: 'ressurreicao', claro: true },
  { id: 'pentecostes', nome: 'Pentecostes', fundo: ['#2e0805', '#a8231a'], texto: '#ffffff', destaque: '#ffcf5c', suave: '#ffd9cc', simbolo: 'chamas' },
  { id: 'comum', nome: 'Tempo Comum', fundo: ['#0c2619', '#2c6644'], texto: '#ffffff', destaque: '#e7cf7a', suave: '#cfe3d5', simbolo: 'trigo' },
  { id: 'maria', nome: 'Nossa Senhora', fundo: ['#0b2142', '#2d5c9b'], texto: '#ffffff', destaque: '#f1d38a', suave: '#d4e0f2', simbolo: 'maria' },
  { id: 'solenidade', nome: 'Solenidades e festas', fundo: ['#241803', '#73540f'], texto: '#ffffff', destaque: '#ffe08a', suave: '#f1e2bb', simbolo: 'calice' },
  { id: 'cristo-rei', nome: 'Cristo Rei', fundo: ['#241803', '#86621a'], texto: '#ffffff', destaque: '#ffe08a', suave: '#f1e2bb', simbolo: 'coroa-rei' },
  { id: 'finados', nome: 'Finados', fundo: ['#09090d', '#2a2a35'], texto: '#ffffff', destaque: '#f3c76b', suave: '#c8c8d2', simbolo: 'vela' },
];
export const capaPorId = id => CAPAS.find(c => c.id === id) || null;

// ---------- Automática ----------
const POR_TEMPO = { 1: 'advento', 2: 'quaresma', 3: 'pascoa', 4: 'natal', 5: 'comum', 6: 'semana-santa', 7: 'solenidade' };
const sem = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function capaAutomatica(x) {
  const t = sem(x?.titulo);
  if (/pentecostes/.test(t)) return capaPorId('pentecostes');
  if (/cristo rei|rei do universo/.test(t)) return capaPorId('cristo-rei');
  if (/finados|fieis defuntos|defuntos/.test(t)) return capaPorId('finados');
  if (/ramos|paixao|quinta.?feira santa|sexta.?feira santa|semana santa|ceia do senhor|lava.?pes/.test(t)) return capaPorId('semana-santa');
  if (/natal|epifania|sagrada familia|mae de deus|batismo do senhor/.test(t)) return capaPorId('natal');
  if (/pascoa|ressurreicao|vigilia pascal|ascensao/.test(t)) return capaPorId('pascoa');
  if (/\bmaria\b|nossa senhora|imaculada|assuncao|aparecida|rosario|anunciacao/.test(t)) return capaPorId('maria');
  if (/corpus christi|trindade|todos os santos|sagrado coracao|solenidade|\bsao\b|\bsanto\b|\bsanta\b|apostolos|transfiguracao|exaltacao/.test(t)) return capaPorId('solenidade');
  return capaPorId(POR_TEMPO[x?.tempo] || 'comum');
}
// escolha guardada na missa: 'auto' (padrão), o id de uma capa, ou 'nenhuma'
export const capaDaMissa = x => (x?.capa === 'nenhuma' ? null : x?.capa && x.capa !== 'auto' ? capaPorId(x.capa) || capaAutomatica(x) : capaAutomatica(x));
// cores dos slides do tempo (as mesmas da capa)
export const temaDaCapa = c => c && (c.claro
  ? { fundo: c.fundo[0].slice(1), texto: c.texto.slice(1), refrao: c.destaque.slice(1), suave: c.suave.slice(1) }
  : { fundo: c.fundo[0].slice(1), texto: 'FFFFFF', refrao: c.destaque.slice(1), suave: c.suave.slice(1) });

// ---------- Desenhos (caixa de -100 a 100) ----------
const estrela = (cx, cy, r, pontas = 5, cor = '#fff', interno = 0.45) => {
  const p = [];
  for (let i = 0; i < pontas * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / pontas, rr = i % 2 ? r * interno : r; p.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`); }
  return `<polygon points="${p.join(' ')}" fill="${cor}"/>`;
};
const raios = (n, r1, r2, cor, larg = 3, op = 0.55) => Array.from({ length: n }, (_, i) => {
  const a = (i * 2 * Math.PI) / n, r = i % 2 ? r2 * 0.72 : r2;
  return `<line x1="${(r1 * Math.cos(a)).toFixed(1)}" y1="${(r1 * Math.sin(a)).toFixed(1)}" x2="${(r * Math.cos(a)).toFixed(1)}" y2="${(r * Math.sin(a)).toFixed(1)}" stroke="${cor}" stroke-width="${larg}" stroke-linecap="round" opacity="${op}"/>`;
}).join('');
const cruz = (cor, esc = 1, dy = 0) => `<g transform="translate(0 ${dy}) scale(${esc})"><rect x="-9" y="-88" width="18" height="176" rx="3" fill="${cor}"/><rect x="-52" y="-50" width="104" height="18" rx="3" fill="${cor}"/></g>`;
const chama = (x, y, s, cor1, cor2) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0,-40 C14,-20 26,-6 22,12 C19,27 9,34 0,34 C-9,34 -19,27 -22,12 C-26,-6 -14,-20 0,-40 Z" fill="${cor1}"/><path d="M0,-14 C7,-3 12,5 10,15 C8,23 4,27 0,27 C-4,27 -8,23 -10,15 C-12,5 -7,-3 0,-14 Z" fill="${cor2}"/></g>`;
function simbolo(c) {
  const d = c.destaque, t = c.texto;
  switch (c.simbolo) {
    case 'coroa': {           // coroa do Advento: guirlanda e 4 velas (3 roxas e 1 rosa)
      const velas = [[-54, '#7b3fa0', 1], [-18, '#8e4cb5', 1], [18, '#d77fb0', 1], [54, '#7b3fa0', 1]]
        .map(([x, cor]) => `<rect x="${x - 8}" y="-30" width="16" height="62" rx="3" fill="${cor}"/>${chama(x, -44, 0.45, d, '#fff6d0')}`).join('');
      return `<ellipse cx="0" cy="34" rx="86" ry="22" fill="none" stroke="#2f6b3c" stroke-width="16"/><ellipse cx="0" cy="34" rx="86" ry="22" fill="none" stroke="#4f9a5c" stroke-width="5" stroke-dasharray="7 9"/>${velas}`;
    }
    case 'estrela':           // estrela de Belém
      return `${raios(16, 30, 92, d, 2.5, 0.5)}${estrela(0, 0, 62, 8, d, 0.36)}${estrela(0, 0, 26, 8, '#fff', 0.5)}<circle cx="-70" cy="-58" r="3" fill="${d}"/><circle cx="74" cy="-40" r="2.5" fill="${d}"/><circle cx="60" cy="66" r="2" fill="${d}"/>`;
    case 'cruz':              // Quaresma: cruz sobre o deserto
      return `<path d="M-100,78 Q-40,58 0,70 T100,66 L100,100 L-100,100 Z" fill="${d}" opacity="0.28"/>${cruz(d, 0.92, -8)}`;
    case 'espinhos':          // Semana Santa: cruz e coroa de espinhos
      return `${cruz(d, 0.95, 0)}<ellipse cx="0" cy="-34" rx="40" ry="14" fill="none" stroke="#b9895a" stroke-width="5"/>${Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * 2 * Math.PI, x = 40 * Math.cos(a), y = -34 + 14 * Math.sin(a); return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x * 1.18).toFixed(1)}" y2="${(-34 + (y + 34) * 1.6 - 4).toFixed(1)}" stroke="#b9895a" stroke-width="2.5"/>`; }).join('')}`;
    case 'ressurreicao':      // Páscoa: cruz gloriosa com raios de luz
      return `${raios(28, 26, 98, d, 3, 0.5)}<circle cx="0" cy="0" r="36" fill="#fff" opacity="0.6"/>${cruz(d, 0.8, 0)}<path d="M-6,-60 h12" stroke="#fff"/>`;
    case 'chamas':            // Pentecostes: línguas de fogo e a pomba
      return `${chama(-48, 18, 1.15, d, '#fff3c4')}${chama(0, -6, 1.5, d, '#fff3c4')}${chama(48, 18, 1.15, d, '#fff3c4')}<path d="M-30,-74 C-14,-86 6,-86 16,-76 C26,-84 40,-84 48,-78 C34,-76 26,-70 22,-62 C10,-56 -10,-58 -30,-74 Z" fill="#fff" opacity="0.9"/>`;
    case 'trigo': {           // Tempo Comum: trigo e uvas (pão e vinho)
      const espiga = (rot) => `<g transform="rotate(${rot})"><line x1="0" y1="90" x2="0" y2="-80" stroke="${d}" stroke-width="3"/>${Array.from({ length: 7 }, (_, i) => `<ellipse cx="-7" cy="${-70 + i * 14}" rx="5" ry="10" transform="rotate(-25 -7 ${-70 + i * 14})" fill="${d}"/><ellipse cx="7" cy="${-70 + i * 14}" rx="5" ry="10" transform="rotate(25 7 ${-70 + i * 14})" fill="${d}"/>`).join('')}</g>`;
      const uvas = [[0, 40], [-12, 28], [12, 28], [-24, 16], [0, 16], [24, 16], [-12, 4], [12, 4], [0, -8]].map(([x, y]) => `<circle cx="${x}" cy="${y + 20}" r="9" fill="#7b4a9e" stroke="${t}" stroke-opacity="0.25"/>`).join('');
      return `${espiga(-22)}${espiga(22)}${uvas}`;
    }
    case 'maria':             // Nossa Senhora: "M" com 12 estrelas
      return `${Array.from({ length: 12 }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 12; return estrela(82 * Math.cos(a), 82 * Math.sin(a), 8, 5, d); }).join('')}<text x="0" y="34" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="110" font-weight="700" fill="${t}">M</text><rect x="-4" y="-66" width="8" height="26" fill="${d}"/><rect x="-12" y="-58" width="24" height="7" fill="${d}"/>`;
    case 'calice':            // Solenidades: cálice e hóstia com raios
      return `${raios(24, 30, 70, d, 2.5, 0.45)}<circle cx="0" cy="-44" r="26" fill="#fff"/><path d="M-5,-56 h10 M0,-61 v14" stroke="${d}" stroke-width="3"/><path d="M-46,-12 h92 C46,22 26,38 6,42 L6,64 C24,68 34,76 36,84 L-36,84 C-34,76 -24,68 -6,64 L-6,42 C-26,38 -46,22 -46,-12 Z" fill="${d}"/>`;
    case 'coroa-rei':         // Cristo Rei: coroa com a cruz
      return `${raios(24, 40, 96, d, 2.5, 0.4)}<path d="M-70,40 L-78,-26 L-40,6 L0,-44 L40,6 L78,-26 L70,40 Z" fill="${d}"/><rect x="-74" y="40" width="148" height="18" rx="4" fill="${d}"/><circle cx="-34" cy="49" r="5" fill="#b3261e"/><circle cx="0" cy="49" r="5" fill="#2d5c9b"/><circle cx="34" cy="49" r="5" fill="#b3261e"/>${cruz('#fff', 0.32, -62)}`;
    case 'vela':              // Finados: vela acesa
      return `<circle cx="0" cy="-52" r="44" fill="${d}" opacity="0.18"/><rect x="-16" y="-30" width="32" height="112" rx="4" fill="#f4efe6"/>${chama(0, -50, 0.62, d, '#fff6d0')}<ellipse cx="0" cy="84" rx="44" ry="8" fill="${d}" opacity="0.4"/>`;
  }
  return '';
}

// ---------- A capa em SVG ----------
const escX = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function quebrarTitulo(t, max) {
  if (t.length <= max) return [t];
  const meio = t.length / 2, esp = [...t.matchAll(/\s/g)].map(m => m.index);
  if (!esp.length) return [t];
  const k = esp.reduce((a, b) => (Math.abs(b - meio) < Math.abs(a - meio) ? b : a));
  return [t.slice(0, k), t.slice(k + 1)];
}
// opcoes: titulo, linha2 (data), linha3 (tempo/ano), largura, altura
export function svgCapa(c, { titulo = '', linha2 = '', linha3 = '', largura = 1600, altura = 900 } = {}) {
  const W = largura, H = altura, retrato = H > W;
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  const tamSimb = retrato ? W * 0.36 : H * 0.36;
  const cy = retrato ? H * 0.3 : H * 0.3;
  const linhas = quebrarTitulo(titulo, retrato ? 22 : 30);
  const fs = Math.min(retrato ? W * 0.085 : H * 0.095, (W * 0.8) / (Math.max(...linhas.map(l => l.length)) * 0.6));
  const yT = retrato ? H * 0.55 : H * 0.6;
  const moldura = Math.min(W, H) * 0.035;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.fundo[0]}"/><stop offset="1" stop-color="${c.fundo[1]}"/></linearGradient>
    <radialGradient id="${id}l" cx="0.5" cy="${cy / H}" r="0.45"><stop offset="0" stop-color="${c.destaque}" stop-opacity="0.32"/><stop offset="1" stop-color="${c.destaque}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#${id}f)"/>
  <rect width="${W}" height="${H}" fill="url(#${id}l)"/>
  <rect x="${moldura}" y="${moldura}" width="${W - 2 * moldura}" height="${H - 2 * moldura}" fill="none" stroke="${c.destaque}" stroke-opacity="0.55" stroke-width="${Math.max(2, W / 600)}"/>
  <rect x="${moldura * 1.4}" y="${moldura * 1.4}" width="${W - 2.8 * moldura}" height="${H - 2.8 * moldura}" fill="none" stroke="${c.destaque}" stroke-opacity="0.3" stroke-width="${Math.max(1, W / 1400)}"/>
  <g transform="translate(${W / 2} ${cy}) scale(${tamSimb / 200})">${simbolo(c)}</g>
  ${linhas.map((l, i) => `<text x="${W / 2}" y="${yT + i * fs * 1.15}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${fs.toFixed(0)}" fill="${c.texto}">${escX(l)}</text>`).join('')}
  <g transform="translate(${W / 2} ${yT + (linhas.length - 1) * fs * 1.15 + fs * 0.75})"><line x1="${-W * 0.12}" y1="0" x2="${-W * 0.02}" y2="0" stroke="${c.destaque}" stroke-width="${Math.max(1.5, W / 900)}"/><line x1="${W * 0.02}" y1="0" x2="${W * 0.12}" y2="0" stroke="${c.destaque}" stroke-width="${Math.max(1.5, W / 900)}"/><rect x="${-W * 0.008}" y="${-W * 0.008}" width="${W * 0.016}" height="${W * 0.016}" transform="rotate(45)" fill="${c.destaque}"/></g>
  ${linha2 ? `<text x="${W / 2}" y="${yT + (linhas.length - 1) * fs * 1.15 + fs * 1.75}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${(fs * 0.42).toFixed(0)}" fill="${c.texto}">${escX(linha2)}</text>` : ''}
  ${linha3 ? `<text x="${W / 2}" y="${yT + (linhas.length - 1) * fs * 1.15 + fs * 2.35}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${(fs * 0.3).toFixed(0)}" letter-spacing="${(fs * 0.04).toFixed(1)}" fill="${c.suave}">${escX(linha3.toUpperCase())}</text>` : ''}
</svg>`;
}
export const urlSvg = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
// SVG -> imagem para o PowerPoint e os PDFs (JPEG: arquivo bem menor que PNG, sem diferença visível)
export async function pngCapa(c, opcoes, tipo = 'image/jpeg') {
  const svg = svgCapa(c, opcoes);
  const img = new Image();
  img.src = urlSvg(svg);
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = opcoes.largura; cv.height = opcoes.altura;
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL(tipo, 0.92);
}
// texto da capa a partir da missa
export function textosDaCapa(x, c) {
  const data = x.data ? new Date(x.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return { titulo: x.titulo || 'Santa Missa', linha2: data ? data.charAt(0).toUpperCase() + data.slice(1) : '', linha3: c?.nome || '' };
}
