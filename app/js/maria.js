// Maria como medidor do afinador (ilustração: assets/maria-*.webp). As mãos postas são uma camada separada que gira como
// ponteiro em torno dos pulsos e de suas pontas sai um feixe de luz, que gira junto, até um arco grande em volta dela
// (♭ à esquerda, ♯ à direita). Fora do tom ela reza (olhos fechados); ao afinar (verde) ela abre os olhos e sorri, as MESMAS mãos se abrem
// (duas metades que se afastam) e o arco acende. O ângulo vem da variável CSS --giro (graus), posta por afinador.js;
// o estado vem de data-estado.
const GRAU_POR_CENT = 0.9;                                  // ±50 cents = ±45°
export const giroDeCents = c => Math.max(-50, Math.min(50, c)) * GRAU_POR_CENT;

// quadro 600×480: a figura (74% da largura) fica embaixo; o pivô das mãos (pulsos) é o centro do arco
const PX = 300, PY = 364, R0 = 335, PONTA = 100;            // PONTA = distância do pivô às pontas dos dedos
const pol = (r, graus) => [PX + r * Math.sin(graus * Math.PI / 180), PY - r * Math.cos(graus * Math.PI / 180)];
function escala() {
  let s = '';
  for (let c = -50; c <= 50; c += 5) {
    const maior = c % 25 === 0, a = c * GRAU_POR_CENT, [x1, y1] = pol(R0, a), [x2, y2] = pol(R0 + (maior ? 26 : 15), a);
    const zona = Math.abs(c) <= 5 ? 'v' : Math.abs(c) <= 20 ? 'a' : 'r';
    s += `<line class="m-t m-t-${zona}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="${maior ? 5 : 3.5}" stroke-linecap="round"/>`;
  }
  const [bx, by] = pol(R0 + 12, -58), [sx, sy] = pol(R0 + 12, 58);
  return s + `<text class="m-bemol" x="${bx.toFixed(1)}" y="${(by + 10).toFixed(1)}" font-size="32" text-anchor="middle">♭</text><text class="m-sustenido" x="${sx.toFixed(1)}" y="${(sy + 10).toFixed(1)}" font-size="32" text-anchor="middle">♯</text>`;
}

export const MARIA_HTML = `<div class="maria-quadro">
  <svg class="m-escala" viewBox="0 0 600 480" role="img" aria-label="Escala: as mãos de Maria apontam, com um feixe de luz, quanto falta para afinar">
    <defs><linearGradient id="m-grad-feixe" gradientUnits="userSpaceOnUse" x1="300" y1="264" x2="300" y2="43"><stop offset="0" stop-color="#f4d36b" stop-opacity=".45"/><stop offset=".45" stop-color="#f4d36b" stop-opacity=".65"/><stop offset="1" stop-color="#f1b928" stop-opacity=".95"/></linearGradient><linearGradient id="m-grad-verde" gradientUnits="userSpaceOnUse" x1="300" y1="264" x2="300" y2="43"><stop offset="0" stop-color="#4caf50" stop-opacity=".45"/><stop offset=".45" stop-color="#4caf50" stop-opacity=".65"/><stop offset="1" stop-color="#43c05a" stop-opacity=".98"/></linearGradient></defs>
    ${escala()}
    <g class="m-agulha"><line class="m-feixe" x1="${PX}" y1="${PY - PONTA}" x2="${PX}" y2="${PY - R0 + 14}" stroke="url(#m-grad-feixe)" stroke-width="5" stroke-linecap="round"/>
      <polygon class="m-marca" points="${PX - 12},${PY - R0 + 28} ${PX + 12},${PY - R0 + 28} ${PX},${PY - R0 + 6}" stroke-linejoin="round"/></g>
  </svg>
  <div class="m-figura">
    <div class="m-brilho"></div>
    <img class="m-img m-rezando" src="assets/maria-rezando.webp" alt="" draggable="false">
    <img class="m-img m-afinada" src="assets/maria-afinada.webp" alt="" draggable="false">
    <div class="m-maos"><img class="m-mao m-mao-e" src="assets/maria-mao-esq.webp" alt="" draggable="false"><img class="m-mao m-mao-d" src="assets/maria-mao-dir.webp" alt="" draggable="false"></div>
    <img class="m-img m-mangas" src="assets/maria-mangas.webp" alt="" draggable="false">
  </div>
</div>`;
