// Capas da missa (slides e PDF das cifras): uma para cada tempo litúrgico e para os dias próprios, desenhadas aqui mesmo
// em SVG. Duas versões: IMPRESSA (PDF A4: degradê, moldura) e PROJETOR (slides projetados direto na parede: fundo preto
// puro — o projetor não acende o preto, então só a luz do desenho e do texto aparece —, símbolo grande, traço grosso,
// sem linhas finas). A automática escolhe pelo dia (Tríduo, Ramos, Corpus Christi, Gaudete/Laetare pela data...), pelo
// nome da festa e, se não for festa, pelo tempo litúrgico.

// claro: capa impressa de fundo claro. luz: cor clara/luminosa do tempo (refrão e brilho no projetor).
export const CAPAS = [
  { id: 'advento', nome: 'Advento', fundo: ['#1f0d33', '#4f2475'], texto: '#ffffff', destaque: '#f2c14e', suave: '#d9c8ec', luz: '#f2c14e', simbolo: 'coroa' },
  { id: 'rosa', nome: 'Gaudete / Laetare (rosa)', fundo: ['#3b1026', '#a8466f'], texto: '#ffffff', destaque: '#ffd1e0', suave: '#f6d6e3', luz: '#ffb3cc', simbolo: 'rosa' },
  { id: 'natal', nome: 'Natal', fundo: ['#fffaf0', '#ecd9a8'], texto: '#3a2a10', destaque: '#a67708', suave: '#5c4a2a', luz: '#ffd76a', acento: '#9b1b30', simbolo: 'estrela', claro: true },
  { id: 'epifania', nome: 'Epifania', fundo: ['#070d24', '#1d2f66'], texto: '#ffffff', destaque: '#f2c14e', suave: '#cdd6f2', luz: '#ffd76a', simbolo: 'magos' },
  { id: 'quaresma', nome: 'Quaresma', fundo: ['#170b26', '#3f2453'], texto: '#ffffff', destaque: '#c9a7e4', suave: '#cbbbd8', luz: '#d9bff0', simbolo: 'cruz' },
  { id: 'ramos', nome: 'Domingo de Ramos', fundo: ['#2c0706', '#8f1c18'], texto: '#ffffff', destaque: '#9fd38a', suave: '#f2cfc8', luz: '#b8e6a0', simbolo: 'palmas' },
  { id: 'quinta-santa', nome: 'Quinta-feira Santa', fundo: ['#fffdf7', '#efe3c4'], texto: '#3a2a10', destaque: '#9a6d05', suave: '#5c4a2a', luz: '#f4dc8c', simbolo: 'lava-pes', claro: true },
  { id: 'sexta-santa', nome: 'Sexta-feira Santa', fundo: ['#160203', '#5a0b10'], texto: '#ffffff', destaque: '#e9a49a', suave: '#e5c2c2', luz: '#f3b6ab', simbolo: 'cruz-nua' },
  { id: 'semana-santa', nome: 'Semana Santa', fundo: ['#200406', '#62101a'], texto: '#ffffff', destaque: '#e9b8a4', suave: '#e5c2c2', luz: '#f3c9b8', simbolo: 'espinhos' },
  { id: 'vigilia', nome: 'Vigília Pascal', fundo: ['#03040a', '#141c38'], texto: '#ffffff', destaque: '#ffd76a', suave: '#cdd3e6', luz: '#ffd76a', simbolo: 'cirio' },
  { id: 'pascoa', nome: 'Tempo Pascal', fundo: ['#fffdf6', '#f3e2ad'], texto: '#3a2a10', destaque: '#9a7408', suave: '#5c4a2a', luz: '#ffe08a', simbolo: 'ressurreicao', claro: true },
  { id: 'pentecostes', nome: 'Pentecostes', fundo: ['#2e0805', '#a8231a'], texto: '#ffffff', destaque: '#ffcf5c', suave: '#ffd9cc', luz: '#ffcf5c', simbolo: 'chamas' },
  { id: 'trindade', nome: 'Santíssima Trindade', fundo: ['#fbfaf5', '#dfe6f1'], texto: '#1d2a44', destaque: '#8a6a12', suave: '#3d4a66', luz: '#ffe08a', acento: '#2d5c9b', simbolo: 'trindade', claro: true },
  { id: 'corpus', nome: 'Corpus Christi', fundo: ['#241803', '#73540f'], texto: '#ffffff', destaque: '#ffe08a', suave: '#f1e2bb', luz: '#ffe08a', simbolo: 'ostensorio' },
  { id: 'comum', nome: 'Tempo Comum', fundo: ['#0c2619', '#2c6644'], texto: '#ffffff', destaque: '#e7cf7a', suave: '#cfe3d5', luz: '#b9e3a5', simbolo: 'trigo' },
  { id: 'maria', nome: 'Nossa Senhora', fundo: ['#0b2142', '#2d5c9b'], texto: '#ffffff', destaque: '#f1d38a', suave: '#d4e0f2', luz: '#a9cdf5', simbolo: 'maria' },
  { id: 'martires', nome: 'Mártires e Apóstolos', fundo: ['#2a0605', '#8a1a16'], texto: '#ffffff', destaque: '#f2c14e', suave: '#f2cfc8', luz: '#ffcf5c', simbolo: 'palma' },
  { id: 'solenidade', nome: 'Solenidades e festas', fundo: ['#241803', '#73540f'], texto: '#ffffff', destaque: '#ffe08a', suave: '#f1e2bb', luz: '#ffe08a', simbolo: 'calice' },
  { id: 'cristo-rei', nome: 'Cristo Rei', fundo: ['#241803', '#86621a'], texto: '#ffffff', destaque: '#ffe08a', suave: '#f1e2bb', luz: '#ffe08a', simbolo: 'coroa-rei' },
  { id: 'finados', nome: 'Finados', fundo: ['#09090d', '#2a2a35'], texto: '#ffffff', destaque: '#f3c76b', suave: '#c8c8d2', luz: '#f3c76b', simbolo: 'vela' },
];
export const capaPorId = id => CAPAS.find(c => c.id === id) || null;

// ---------- Automática ----------
const POR_TEMPO = { 1: 'advento', 2: 'quaresma', 3: 'pascoa', 4: 'natal', 5: 'comum', 6: 'semana-santa', 7: 'solenidade' };
const sem = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function pascoa(ano) {   // algoritmo de Meeus
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451), mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia, 12);
}
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mais = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
// domingo rosa: 3º do Advento (Gaudete) e 4º da Quaresma (Laetare); a missa de sábado à tarde também conta
function domingoRosa(data) {
  if (!data) return false;
  const d = new Date(data + 'T12:00'), ano = d.getFullYear();
  const natal = new Date(ano, 11, 25, 12), advento1 = mais(natal, -((natal.getDay() || 7) + 21));
  const dias = [mais(advento1, 14), mais(pascoa(ano), -21)].map(iso);
  return dias.includes(data) || dias.includes(iso(mais(d, 1)));
}
export function capaAutomatica(x) {
  const t = sem(x?.titulo);
  const regras = [
    ['vigilia', /vigilia pascal|sabado santo/], ['quinta-santa', /quinta.?feira santa|ceia do senhor|lava.?pes/],
    ['sexta-santa', /sexta.?feira santa|paixao do senhor|adoracao da cruz/], ['ramos', /\bramos\b/],
    ['corpus', /corpus christi|corpo e sangue/], ['trindade', /trindade/], ['epifania', /epifania|reis magos/],
    ['pentecostes', /pentecostes/], ['cristo-rei', /cristo rei|rei do universo/], ['finados', /finados|fieis defuntos|defuntos/],
    ['martires', /martir|apostolo|sao pedro e sao paulo|santo estevao|santos inocentes/],
    ['semana-santa', /paixao|semana santa/], ['natal', /natal|sagrada familia|mae de deus|batismo do senhor/],
    ['pascoa', /pascoa|ressurreicao|ascensao/], ['maria', /\bmaria\b|nossa senhora|imaculada|assuncao|aparecida|rosario|anunciacao/],
    ['solenidade', /todos os santos|sagrado coracao|solenidade|\bsao\b|\bsanto\b|\bsanta\b|transfiguracao|exaltacao/],
  ];
  for (const [id, re] of regras) if (re.test(t)) return capaPorId(id);
  if (domingoRosa(x?.data)) return capaPorId('rosa');
  return capaPorId(POR_TEMPO[x?.tempo] || 'comum');
}
// escolha guardada na missa: 'auto' (padrão), o id de uma capa, ou 'nenhuma'
export const capaDaMissa = x => (x?.capa === 'nenhuma' ? null : x?.capa && x.capa !== 'auto' ? capaPorId(x.capa) || capaAutomatica(x) : capaAutomatica(x));
// Cores dos slides do tempo, para PROJETOR NA PAREDE: fundo preto puro (não aparece retângulo na parede), letra branca
// e o refrão na cor clara do tempo (cor escura não aparece projetada)
export const temaDaCapa = c => ({ fundo: '000000', texto: 'FFFFFF', refrao: (c?.luz || '#ffe08a').slice(1), suave: '9A9A9A', negrito: true });

// ---------- Desenhos (caixa de -100 a 100; traço grosso, para ser visto de longe) ----------
const estrela = (cx, cy, r, pontas = 5, cor = '#fff', interno = 0.45) => {
  const p = [];
  for (let i = 0; i < pontas * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / pontas, rr = i % 2 ? r * interno : r; p.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`); }
  return `<polygon points="${p.join(' ')}" fill="${cor}"/>`;
};
const raios = (n, r1, r2, cor, larg = 4, op = 0.6) => Array.from({ length: n }, (_, i) => {
  const a = (i * 2 * Math.PI) / n, r = i % 2 ? r2 * 0.74 : r2;
  return `<line x1="${(r1 * Math.cos(a)).toFixed(1)}" y1="${(r1 * Math.sin(a)).toFixed(1)}" x2="${(r * Math.cos(a)).toFixed(1)}" y2="${(r * Math.sin(a)).toFixed(1)}" stroke="${cor}" stroke-width="${larg}" stroke-linecap="round" opacity="${op}"/>`;
}).join('');
const cruz = (cor, esc = 1, dy = 0) => `<g transform="translate(0 ${dy}) scale(${esc})"><rect x="-11" y="-88" width="22" height="176" rx="3" fill="${cor}"/><rect x="-54" y="-52" width="108" height="22" rx="3" fill="${cor}"/></g>`;
const chama = (x, y, s, cor1, cor2) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0,-40 C14,-20 26,-6 22,12 C19,27 9,34 0,34 C-9,34 -19,27 -22,12 C-26,-6 -14,-20 0,-40 Z" fill="${cor1}"/><path d="M0,-14 C7,-3 12,5 10,15 C8,23 4,27 0,27 C-4,27 -8,23 -10,15 C-12,5 -7,-3 0,-14 Z" fill="${cor2}"/></g>`;
// folha de palmeira: talo curvo com folíolos dos dois lados
const palma = (cor, rot = 0, esc = 1) => {
  const pts = [];
  for (let i = 0; i < 14; i++) {
    const t = 0.12 + i * 0.062, y = 90 - t * 176, x = 8 * 2 * t * (1 - t), l = 34 * (1 - t * 0.7);
    pts.push(`<path d="M${x.toFixed(1)},${y.toFixed(1)} q${(-l * 0.6).toFixed(1)},${(-l * 0.15).toFixed(1)} ${(-l).toFixed(1)},${(-l * 0.55).toFixed(1)}" stroke="${cor}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M${x.toFixed(1)},${y.toFixed(1)} q${(l * 0.6).toFixed(1)},${(-l * 0.15).toFixed(1)} ${l.toFixed(1)},${(-l * 0.55).toFixed(1)}" stroke="${cor}" stroke-width="5" fill="none" stroke-linecap="round"/>`);
  }
  return `<g transform="rotate(${rot}) scale(${esc})"><path d="M0,90 Q8,10 0,-86" stroke="${cor}" stroke-width="6" fill="none" stroke-linecap="round"/>${pts.join('')}</g>`;
};
function simbolo(c, projetor) {
  const d = projetor ? c.luz : c.destaque, t = projetor ? '#ffffff' : c.texto, ac = c.acento || d;
  switch (c.simbolo) {
    case 'coroa': {           // coroa do Advento: guirlanda e 4 velas (3 roxas e 1 rosa)
      const velas = [[-54, '#9b5ccc'], [-18, '#9b5ccc'], [18, '#e58fbd'], [54, '#9b5ccc']]
        .map(([x, cor]) => `<rect x="${x - 10}" y="-30" width="20" height="64" rx="4" fill="${cor}"/>${chama(x, -46, 0.5, d, '#fff6d0')}`).join('');
      return `<ellipse cx="0" cy="36" rx="88" ry="24" fill="none" stroke="#3f8a4e" stroke-width="20"/>${velas}`;
    }
    case 'rosa': {            // domingo rosa (Gaudete/Laetare): uma rosa
      const pet = Array.from({ length: 5 }, (_, i) => { const a = (i * 72 - 90) * Math.PI / 180, x = (30 * Math.cos(a)).toFixed(1), y = (30 * Math.sin(a) - 20).toFixed(1); return `<ellipse cx="${x}" cy="${y}" rx="30" ry="24" transform="rotate(${i * 72} ${x} ${y})" fill="#e889ad"/>`; }).join('');
      return `<path d="M0,20 C0,50 4,70 0,96" stroke="#5fae6a" stroke-width="7" fill="none"/><path d="M2,62 C24,46 44,52 52,60 C38,72 18,72 2,62 Z" fill="#5fae6a"/><path d="M-2,74 C-22,60 -40,64 -48,72 C-34,84 -16,84 -2,74 Z" fill="#5fae6a"/>${pet}<circle cx="0" cy="-20" r="22" fill="#c2517b"/><circle cx="0" cy="-20" r="10" fill="${d}"/>`;
    }
    case 'estrela':           // estrela de Belém
      return `${raios(16, 30, 94, d, 4, 0.6)}${estrela(0, 0, 64, 8, d, 0.36)}${estrela(0, 0, 26, 8, projetor ? '#fff' : ac, 0.5)}`;
    case 'magos':             // Epifania: estrela e os três presentes
      return `${raios(12, 18, 56, d, 4, 0.55)}${estrela(0, -40, 34, 5, d, 0.42)}<rect x="-80" y="44" width="40" height="34" rx="4" fill="${d}"/><rect x="-84" y="36" width="48" height="10" rx="3" fill="${d}"/><path d="M-14,78 C-22,58 -16,44 0,40 C16,44 22,58 14,78 Z" fill="${d}"/><rect x="-6" y="30" width="12" height="12" rx="3" fill="${d}"/><path d="M48,78 L50,46 L44,40 L76,40 L70,46 L72,78 Z" fill="${d}"/>`;
    case 'cruz':              // Quaresma: cruz sobre o deserto
      return `<path d="M-100,80 Q-40,60 0,72 T100,68 L100,100 L-100,100 Z" fill="${d}" opacity="0.4"/>${cruz(d, 0.92, -8)}`;
    case 'palmas':            // Domingo de Ramos: duas palmas
      return `<g transform="translate(-22 4)">${palma(d, -26, 0.9)}</g><g transform="translate(22 4)">${palma(d, 26, 0.9)}</g>`;
    case 'lava-pes':          // Quinta-feira Santa: jarro e bacia do lava-pés
      return `<path d="M-34,-74 L26,-74 L36,-58 C58,-56 64,-30 46,-14 L40,-10 L34,-22 C46,-30 46,-46 34,-48 L30,6 L-38,6 L-42,-60 Z" fill="${d}"/><path d="M-34,-74 L-50,-82 L-30,-66 Z" fill="${d}"/><path d="M-86,34 L86,34 C80,70 50,86 0,86 C-50,86 -80,70 -86,34 Z" fill="${d}"/><rect x="-92" y="26" width="184" height="12" rx="6" fill="${d}"/>`;
    case 'cruz-nua':          // Sexta-feira Santa: só a cruz
      return cruz(d, 1.05, 0);
    case 'espinhos':          // Semana Santa: cruz e coroa de espinhos
      return `${cruz(d, 0.95, 0)}<ellipse cx="0" cy="-38" rx="46" ry="16" fill="none" stroke="#c99a68" stroke-width="9"/>${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * 2 * Math.PI, x = 46 * Math.cos(a), y = -38 + 16 * Math.sin(a); return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x * 1.22).toFixed(1)}" y2="${(-38 + (y + 38) * 1.7 - 6).toFixed(1)}" stroke="#c99a68" stroke-width="5" stroke-linecap="round"/>`; }).join('')}`;
    case 'cirio':             // Vigília Pascal: Círio aceso com a cruz, Alfa e Ômega
      return `<circle cx="0" cy="-66" r="40" fill="${d}" opacity="0.22"/>${chama(0, -70, 0.7, d, '#fff6d0')}<rect x="-22" y="-44" width="44" height="140" rx="5" fill="#f6f1e6"/><rect x="-3.5" y="-26" width="7" height="44" fill="#b3261e"/><rect x="-14" y="-12" width="28" height="7" fill="#b3261e"/><text x="0" y="-32" text-anchor="middle" font-family="Georgia, serif" font-size="14" font-weight="700" fill="#b3261e">Α</text><text x="0" y="40" text-anchor="middle" font-family="Georgia, serif" font-size="14" font-weight="700" fill="#b3261e">Ω</text>`;
    case 'ressurreicao':      // Páscoa: cruz gloriosa com raios de luz
      return `${raios(24, 30, 98, d, 4.5, 0.6)}${cruz(d, 0.82, 0)}`;
    case 'chamas':            // Pentecostes: línguas de fogo
      return `${chama(-52, 22, 1.2, d, '#fff3c4')}${chama(0, -8, 1.6, d, '#fff3c4')}${chama(52, 22, 1.2, d, '#fff3c4')}`;
    case 'trindade': {        // Santíssima Trindade: três círculos entrelaçados e o triângulo
      const cores = projetor ? [d, d, d] : [d, ac, d];
      return `<path d="M0,-74 L68,46 L-68,46 Z" fill="none" stroke="${d}" stroke-width="7" stroke-linejoin="round"/>${[[0, -26], [-30, 26], [30, 26]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="38" fill="none" stroke="${cores[i]}" stroke-width="8"/>`).join('')}`;
    }
    case 'ostensorio':        // Corpus Christi: ostensório
      return `${raios(28, 40, 86, d, 4, 0.75)}<circle cx="0" cy="-20" r="40" fill="${d}"/><circle cx="0" cy="-20" r="28" fill="#fffaf0"/><path d="M-3,-34 h6 v28 h-6 Z M-12,-25 h24 v6 h-24 Z" fill="${d}"/><rect x="-6" y="20" width="12" height="46" fill="${d}"/><ellipse cx="0" cy="44" rx="16" ry="7" fill="${d}"/><path d="M-40,92 C-36,76 -18,66 0,64 C18,66 36,76 40,92 Z" fill="${d}"/>`;
    case 'trigo': {           // Tempo Comum: trigo e uvas (pão e vinho)
      const espiga = (rot) => `<g transform="rotate(${rot})"><line x1="0" y1="92" x2="0" y2="-82" stroke="${d}" stroke-width="5"/>${Array.from({ length: 6 }, (_, i) => `<ellipse cx="-9" cy="${-72 + i * 15}" rx="7" ry="12" transform="rotate(-25 -9 ${-72 + i * 15})" fill="${d}"/><ellipse cx="9" cy="${-72 + i * 15}" rx="7" ry="12" transform="rotate(25 9 ${-72 + i * 15})" fill="${d}"/>`).join('')}</g>`;
      const uvas = [[0, 0], [-15, -14], [15, -14], [-30, -28], [0, -28], [30, -28]].map(([x, y]) => `<circle cx="${x}" cy="${y + 92}" r="12" fill="${projetor ? '#b98ae0' : '#7b4a9e'}"/>`).join('');
      return `${espiga(-24)}${espiga(24)}${uvas}`;
    }
    case 'maria':             // Nossa Senhora: "M" com 12 estrelas
      return `${Array.from({ length: 12 }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 12; return estrela(84 * Math.cos(a), 84 * Math.sin(a), 10, 5, d); }).join('')}<text x="0" y="36" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="116" font-weight="700" fill="${t}">M</text><rect x="-5" y="-70" width="10" height="28" fill="${d}"/><rect x="-14" y="-62" width="28" height="9" fill="${d}"/>`;
    case 'palma':             // Mártires e Apóstolos: palma do martírio e coroa
      return `${palma(d, 0, 1)}<circle cx="0" cy="-62" r="30" fill="none" stroke="${d}" stroke-width="8" stroke-dasharray="10 6"/>`;
    case 'calice':            // Solenidades: cálice e hóstia com raios
      return `${raios(24, 34, 74, d, 4, 0.55)}<circle cx="0" cy="-46" r="28" fill="#fffaf0"/><path d="M-6,-58 h12 M0,-64 v16" stroke="${d}" stroke-width="4"/><path d="M-48,-12 h96 C48,22 28,40 7,44 L7,64 C26,68 36,76 38,86 L-38,86 C-36,76 -26,68 -7,64 L-7,44 C-28,40 -48,22 -48,-12 Z" fill="${d}"/>`;
    case 'coroa-rei':         // Cristo Rei: coroa com a cruz
      return `${raios(20, 44, 96, d, 4, 0.5)}<path d="M-72,40 L-80,-28 L-40,6 L0,-46 L40,6 L80,-28 L72,40 Z" fill="${d}"/><rect x="-76" y="40" width="152" height="20" rx="5" fill="${d}"/><circle cx="-36" cy="50" r="6" fill="#b3261e"/><circle cx="0" cy="50" r="6" fill="#2d5c9b"/><circle cx="36" cy="50" r="6" fill="#b3261e"/>${cruz('#fff', 0.34, -64)}`;
    case 'vela':              // Finados: vela acesa
      return `<circle cx="0" cy="-54" r="46" fill="${d}" opacity="0.22"/><rect x="-18" y="-30" width="36" height="114" rx="5" fill="#f4efe6"/>${chama(0, -52, 0.66, d, '#fff6d0')}`;
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
// opcoes: titulo, linha2 (data), linha3 (tempo/ano), linha4 (paróquia), largura, altura, projetor
export function svgCapa(c, { titulo = '', linha2 = '', linha3 = '', linha4 = '', largura = 1600, altura = 900, projetor = false } = {}) {
  const W = largura, H = altura, retrato = H > W;
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  const corTexto = projetor ? '#ffffff' : c.texto, corSuave = projetor ? '#bdbdbd' : c.suave, corLinha = projetor ? c.luz : (c.acento || c.destaque);
  const linhas = quebrarTitulo(titulo, retrato ? 20 : 28);
  // tamanhos: projetor maior (de longe); título nunca passa de 78% da largura (margem para a projeção torta)
  const fs = Math.min(retrato ? W * 0.082 : H * (projetor ? 0.1 : 0.09), (W * 0.78) / (Math.max(...linhas.map(l => l.length)) * 0.56));
  const S = retrato ? W * 0.4 : H * (projetor ? 0.4 : 0.34);                 // símbolo
  // bloco centralizado na vertical: símbolo, espaço, título, ornamento, data, tempo
  const hTexto = linhas.length * fs * 1.15 + fs * 0.8 + (linha2 ? fs * 0.75 : 0) + (linha3 ? fs * 0.6 : 0);
  const gap = H * 0.045, total = S + gap + hTexto;
  const y0 = (H - total) / 2 - (retrato ? H * 0.02 : 0);
  const cy = y0 + S / 2, yT = y0 + S + gap + fs * 0.85;
  const yOrn = yT + (linhas.length - 1) * fs * 1.15 + fs * 0.55, y2 = yOrn + fs * 0.9, y3 = y2 + fs * 0.62;
  const moldura = Math.min(W, H) * 0.035;
  const fundo = projetor
    ? `<rect width="${W}" height="${H}" fill="#000"/><radialGradient id="${id}l" cx="0.5" cy="${cy / H}" r="${retrato ? 0.32 : 0.36}"><stop offset="0" stop-color="${c.luz}" stop-opacity="0.28"/><stop offset="1" stop-color="${c.luz}" stop-opacity="0"/></radialGradient><rect width="${W}" height="${H}" fill="url(#${id}l)"/>`
    : `<linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.fundo[0]}"/><stop offset="1" stop-color="${c.fundo[1]}"/></linearGradient>
  <radialGradient id="${id}l" cx="0.5" cy="${cy / H}" r="0.45"><stop offset="0" stop-color="${c.destaque}" stop-opacity="0.3"/><stop offset="1" stop-color="${c.destaque}" stop-opacity="0"/></radialGradient>
  <rect width="${W}" height="${H}" fill="url(#${id}f)"/><rect width="${W}" height="${H}" fill="url(#${id}l)"/>
  <rect x="${moldura}" y="${moldura}" width="${W - 2 * moldura}" height="${H - 2 * moldura}" fill="none" stroke="${corLinha}" stroke-opacity="0.6" stroke-width="${Math.max(2, W / 500)}"/>
  <rect x="${moldura * 1.4}" y="${moldura * 1.4}" width="${W - 2.8 * moldura}" height="${H - 2.8 * moldura}" fill="none" stroke="${corLinha}" stroke-opacity="0.35" stroke-width="${Math.max(1, W / 1200)}"/>`;
  const traco = Math.max(2, W / (projetor ? 500 : 800));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${fundo}
  <g transform="translate(${W / 2} ${cy}) scale(${S / 200})">${simbolo(c, projetor)}</g>
  ${linhas.map((l, i) => `<text x="${W / 2}" y="${yT + i * fs * 1.15}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${fs.toFixed(0)}" fill="${corTexto}">${escX(l)}</text>`).join('')}
  <g transform="translate(${W / 2} ${yOrn})"><line x1="${-W * 0.11}" y1="0" x2="${-W * 0.022}" y2="0" stroke="${corLinha}" stroke-width="${traco}"/><line x1="${W * 0.022}" y1="0" x2="${W * 0.11}" y2="0" stroke="${corLinha}" stroke-width="${traco}"/><rect x="${-W * 0.009}" y="${-W * 0.009}" width="${W * 0.018}" height="${W * 0.018}" transform="rotate(45)" fill="${corLinha}"/></g>
  ${linha2 ? `<text x="${W / 2}" y="${y2}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${(fs * 0.46).toFixed(0)}" fill="${corTexto}">${escX(linha2)}</text>` : ''}
  ${linha3 ? `<text x="${W / 2}" y="${y3}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${(fs * 0.36).toFixed(0)}" letter-spacing="${(fs * 0.05).toFixed(1)}" fill="${corSuave}">${escX(linha3.toUpperCase())}</text>` : ''}
  ${linha4 ? `<text x="${W / 2}" y="${H - moldura * 2.4}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="${(fs * 0.4).toFixed(0)}" fill="${corSuave}">${escX(linha4)}</text>` : ''}
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
// texto da capa a partir da missa (paróquia: Ajustes)
export function textosDaCapa(x, c, paroquia = '') {
  const data = x.data ? new Date(x.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return { titulo: x.titulo || 'Santa Missa', linha2: data ? data.charAt(0).toUpperCase() + data.slice(1) : '', linha3: c?.nome || '', linha4: paroquia || '' };
}
