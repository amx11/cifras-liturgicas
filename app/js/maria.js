// Maria como medidor do afinador. As mãos são contornos vetoriais da própria ilustração (maria-maos.js): postas, inclinam-se
// como ponteiro dobrando no pulso, com o antebraço preso dentro da manga; afinado (verde), as MESMAS mãos se abrem e ela abre
// os olhos e sorri (só olhos e boca mudam entre as duas imagens). Um feixe liga as pontas dos dedos ao arco.
// afinador.js informa o ângulo na variável CSS --giro (graus) e o estado em data-estado; aqui só se anima até esse alvo.
import { MAOS } from './maria-maos.js';

const GRAU_POR_CENT = 0.8;                                  // ±50 cents = ±40°
export const giroDeCents = c => Math.max(-50, Math.min(50, c)) * GRAU_POR_CENT;

// ---- escala: quadro 600×480; a figura ocupa 74% da largura e o pivô do ponteiro é o centro do arco ----
const PX = 300, PY = 348, R0 = 319, PONTA = 80;             // PONTA = distância do pivô às pontas dos dedos
const pol = (r, graus) => [PX + r * Math.sin(graus * Math.PI / 180), PY - r * Math.cos(graus * Math.PI / 180)];
function escala() {
  let s = '';
  for (let c = -50; c <= 50; c += 5) {
    const maior = c % 25 === 0, a = c * GRAU_POR_CENT, [x1, y1] = pol(R0, a), [x2, y2] = pol(R0 + (maior ? 26 : 15), a);
    const zona = Math.abs(c) <= 5 ? 'v' : Math.abs(c) <= 20 ? 'a' : 'r';
    s += `<line class="m-t m-t-${zona}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="${maior ? 5 : 3.5}" stroke-linecap="round"/>`;
  }
  const [bx, by] = pol(R0 + 12, -50), [sx, sy] = pol(R0 + 12, 50);
  return s + `<text class="m-bemol" x="${bx.toFixed(1)}" y="${(by + 10).toFixed(1)}" font-size="32" text-anchor="middle">♭</text><text class="m-sustenido" x="${sx.toFixed(1)}" y="${(sy + 10).toFixed(1)}" font-size="32" text-anchor="middle">♯</text>`;
}
const grad = (id, c0, c1, o0 = 0.45, o1 = 0.65) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${PX}" y1="${PY - PONTA}" x2="${PX}" y2="${PY - R0 + 14}"><stop offset="0" stop-color="${c0}" stop-opacity="${o0}"/><stop offset=".45" stop-color="${c0}" stop-opacity="${o1}"/><stop offset="1" stop-color="${c1}" stop-opacity=".98"/></linearGradient>`;

export const MARIA_HTML = `<div class="maria-quadro">
  <svg class="m-escala" viewBox="0 0 600 480" role="img" aria-label="Escala: as mãos de Maria apontam, com um feixe de luz, quanto falta para afinar">
    <defs>${grad('m-grad-feixe', '#f4d36b', '#f1b928')}${grad('m-grad-verde', '#4caf50', '#43c05a', 0, 0.1)}<radialGradient id="m-grad-rosto"><stop offset=".72" stop-color="#000"/><stop offset="1" stop-color="#fff"/></radialGradient><mask id="m-fora-rosto" maskUnits="userSpaceOnUse" x="-60" y="-60" width="720" height="600"><rect x="-60" y="-60" width="720" height="600" fill="#fff"/><ellipse cx="291" cy="160" rx="52" ry="70" fill="url(#m-grad-rosto)"/></mask></defs>
    ${escala()}
    <g mask="url(#m-fora-rosto)"><g class="m-agulha"><line class="m-feixe" x1="${PX}" y1="${PY - PONTA}" x2="${PX}" y2="${PY - R0 + 14}" stroke-width="5" stroke-linecap="round"/>
      <polygon class="m-marca" points="${PX - 12},${PY - R0 + 28} ${PX + 12},${PY - R0 + 28} ${PX},${PY - R0 + 6}" stroke-linejoin="round"/></g></g>
  </svg>
  <div class="m-figura">
    <div class="m-brilho"></div>
    <img class="m-img m-rezando" src="assets/maria-rezando.webp" alt="" draggable="false">
    <img class="m-img m-afinada" src="assets/maria-afinada.webp" alt="" draggable="false">
    <svg class="m-img m-maos" viewBox="0 0 2048 2048" aria-hidden="true">${['e', 'd'].map(l => `<path class="m-contorno" data-l="${l}" data-p="silhueta"/><path class="m-miolo" data-l="${l}" data-p="miolo"/>`).join('')}</svg>
    <img class="m-img m-mangas" src="assets/maria-mangas.webp" alt="" draggable="false">
  </div>
</div>`;

// ---- mãos: da pose aberta (os pontos gravados) para a pose de oração, inclinando no pulso ----
const CENTRO = 1015, BASE_Y = 1480, ESTREITA = 0.55, GIRA = 30, POLEGAR = 22, RAD = Math.PI / 180;
const BRACO = {                                             // manga → pulso, e o ponto em torno do qual a mão gira ao fechar
  e: { s: [728, 1612], w: [826, 1470], k: [860, 1480], g: GIRA, sinal: 1, polegar: [858, 1335] },
  d: { s: [1325, 1618], w: [1222, 1470], k: [1188, 1480], g: -GIRA, sinal: -1, polegar: [1192, 1335] },
};
const suave = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const gira = (x, y, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; };
function adensar(c) {                                       // pontos a cada ~14 px, para a dobra sair lisa
  const out = [], n = c.length / 2;
  for (let i = 0; i < n; i++) {
    const x = c[2 * i], y = c[2 * i + 1], j = (i + 1) % n, X = c[2 * j], Y = c[2 * j + 1], q = Math.max(1, Math.floor(Math.hypot(X - x, Y - y) / 14));
    for (let k = 0; k < q; k++) out.push([x + (X - x) * k / q, y + (Y - y) * k / q]);
  }
  return out;
}
function dobraPolegar(x, y, b, k) {                         // ao fechar, o polegar encosta nos dedos
  const borda = (1300 - y) * -0.02, dentro = b.sinal > 0 ? x > 838 + borda : x < 1212 - borda;
  return dentro && y < 1340 ? gira(x, y, ...b.polegar, -POLEGAR * b.sinal * RAD * suave((1340 - y) / 70) * k) : [x, y];
}
function fechada(x, y, b) { const [X, Y] = gira(x, y, ...b.k, b.g * RAD); return [b.k[0] + (X - b.k[0]) * ESTREITA, Y]; }
const PRONTAS = Object.fromEntries(Object.entries(MAOS).map(([l, m]) => {
  const b = BRACO[l], pecas = { silhueta: m.silhueta.map(adensar), miolo: m.miolo.map(adensar) };
  // desloca a mão fechada até as pontas dos dedos se encontrarem no centro
  const q = pecas.silhueta[0].map(([x, y]) => fechada(...dobraPolegar(x, y, b, 1), b)), topo = Math.min(...q.map(p => p[1])), xs = q.filter(p => p[1] < topo + 60).map(p => p[0]);
  return [l, { b, pecas, dx: CENTRO - (b.sinal > 0 ? Math.max(...xs) : Math.min(...xs)) + 5 * b.sinal }];
}));
function caminho(contornos, b, dx, abre, fi) {
  const vx = b.w[0] - b.s[0], vy = b.w[1] - b.s[1], vv = vx * vx + vy * vy;
  let d = '';
  for (const c of contornos) {
    c.forEach(([x0, y0], i) => {
      const [x, y] = dobraPolegar(x0, y0, b, 1 - abre), peso = suave(((x0 - b.s[0]) * vx + (y0 - b.s[1]) * vy) / vv) * (1 - abre);   // 0 na manga, 1 na mão
      const [fx, fy] = fechada(x, y, b), X = x + (fx + dx - x) * peso, Y = y + (fy - y) * peso;
      const [px, py] = gira(X, Y, CENTRO, BASE_Y, fi * RAD * suave((1500 - Y) / 170));   // inclina do pulso para cima
      d += (i ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
    });
    d += 'Z';
  }
  return d;
}

// Liga a animação: observa --giro e data-estado e leva mãos e feixe até lá (só redesenha enquanto há movimento).
export function animarMaria(maria) {
  const cartao = maria.closest('.afinador'), paths = [...maria.querySelectorAll('.m-maos path')], agulha = maria.querySelector('.m-agulha');
  const direto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let fi = 0, abre = 0, rodando = false, antes = 0;
  const desenhar = () => {
    const f = fi * (1 - abre);
    for (const p of paths) { const m = PRONTAS[p.dataset.l]; p.setAttribute('d', caminho(m.pecas[p.dataset.p], m.b, m.dx, abre, f)); }
    agulha.setAttribute('transform', `rotate(${fi.toFixed(2)} ${PX} ${PY})`);
  };
  const quadro = t => {
    const dt = Math.max(0, Math.min(60, t - antes)); antes = t;
    const alvoF = parseFloat(maria.style.getPropertyValue('--giro')) || 0, alvoA = /^(ok|perfeito)$/.test(cartao.dataset.estado || '') ? 1 : 0;
    fi += (alvoF - fi) * (direto ? 1 : 1 - Math.exp(-dt / 45)); abre += (alvoA - abre) * (direto ? 1 : 1 - Math.exp(-dt / 110));
    if (Math.abs(alvoF - fi) < 0.05 && Math.abs(alvoA - abre) < 0.004) { fi = alvoF; abre = alvoA; rodando = false; }
    desenhar();
    if (rodando && maria.isConnected) requestAnimationFrame(quadro); else rodando = false;
  };
  const acordar = () => { if (!rodando) { rodando = true; antes = performance.now(); requestAnimationFrame(quadro); } };
  new MutationObserver(acordar).observe(cartao, { attributes: true, attributeFilter: ['data-estado'] });
  new MutationObserver(acordar).observe(maria, { attributes: true, attributeFilter: ['style'] });
  desenhar();
}
