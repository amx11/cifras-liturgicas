// Maria como medidor do afinador (ilustração: assets/maria-*.webp). As mãos postas são uma camada separada que gira como
// ponteiro em torno dos pulsos, sobre uma escala em arco (♭ à esquerda, ♯ à direita). Fora do tom ela reza (olhos fechados);
// ao afinar (verde) a imagem troca por Maria sorrindo, de olhos abertos e mãos abertas, e a escala acende.
// O ângulo vem da variável CSS --giro (graus), posta por afinador.js; a troca de estado vem de data-estado.
const GRAU_POR_CENT = 0.9;                                  // ±50 cents = ±45° (as mãos apontam para o tracinho)
export const giroDeCents = c => Math.max(-50, Math.min(50, c)) * GRAU_POR_CENT;

const PX = 300, PY = 455;                                   // pivô (pulsos) no quadro 600×600
const pol = (r, graus) => [PX + r * Math.sin(graus * Math.PI / 180), PY - r * Math.cos(graus * Math.PI / 180)];
function escala() {
  let s = '';
  for (let c = -50; c <= 50; c += 5) {
    const maior = c % 25 === 0, a = c * GRAU_POR_CENT, [x1, y1] = pol(158, a), [x2, y2] = pol(158 + (maior ? 20 : 12), a);
    const zona = Math.abs(c) <= 5 ? 'v' : Math.abs(c) <= 20 ? 'a' : 'r';
    s += `<line class="m-t m-t-${zona}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="${maior ? 4 : 3}" stroke-linecap="round"/>`;
  }
  const [bx, by] = pol(190, -52), [sx, sy] = pol(190, 52);
  return s + `<text class="m-bemol" x="${bx.toFixed(1)}" y="${(by + 8).toFixed(1)}" font-size="26" text-anchor="middle">♭</text><text class="m-sustenido" x="${sx.toFixed(1)}" y="${(sy + 8).toFixed(1)}" font-size="26" text-anchor="middle">♯</text>`;
}

export const MARIA_HTML = `<div class="maria-quadro">
  <div class="m-brilho"></div>
  <img class="m-img m-rezando" src="assets/maria-rezando.webp" alt="" draggable="false">
  <img class="m-img m-afinada" src="assets/maria-afinada.webp" alt="" draggable="false">
  <img class="m-maos" src="assets/maria-maos.webp" alt="" draggable="false">
  <svg class="m-escala" viewBox="0 0 600 600" role="img" aria-label="Escala: as mãos de Maria apontam quanto falta para afinar">${escala()}
    <polygon class="m-marca" points="${(PX - 11).toFixed(0)},${PY - 196} ${(PX + 11).toFixed(0)},${PY - 196} ${PX},${PY - 178}" stroke-linejoin="round"/>
  </svg>
</div>`;
