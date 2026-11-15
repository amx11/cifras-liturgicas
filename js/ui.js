// Utilidades de interface compartilhadas pelas telas
import { estado, salvarPrefs } from './dados.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Ordem e cores dos tempos litúrgicos (ids do site da arquidiocese)
export const ORDEM_TEMPOS = [1, 4, 5, 2, 6, 3, 7];
export const COR_TEMPO = { 1: 'var(--t-advento)', 4: 'var(--t-natal)', 5: 'var(--t-comum)', 2: 'var(--t-quaresma)',
  6: 'var(--t-semana)', 3: 'var(--t-pascal)', 7: 'var(--t-festas)' };
export const ORDEM_PARTES = [4, 19, 5, 1, 6, 3, 10, 2, 15, 16, 18];

export const nomeTempo = id => estado.taxonomia.tempos[id] || '';
export const nomeParte = id => estado.taxonomia.partes[id] || '';

let temporizador;
export function aviso(texto, ms = 2600) {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.classList.add('visivel');
  clearTimeout(temporizador);
  temporizador = setTimeout(() => el.classList.remove('visivel'), ms);
}

// Janela sobreposta; devolve { el, fechar }
export function modal(html, { aoFechar } = {}) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', tecla); aoFechar?.(); };
  const tecla = e => { if (e.key === 'Escape') fechar(); };
  fundo.addEventListener('click', e => { if (e.target === fundo || e.target.closest('[data-fechar]')) fechar(); });
  document.addEventListener('keydown', tecla);
  document.body.append(fundo);
  fundo.querySelector('input, select, textarea, button')?.focus();
  return { el: fundo.querySelector('.modal'), fechar };
}

export function confirmar(texto, rotulo = 'Confirmar') {
  return new Promise(ok => {
    const { el, fechar } = modal(`<p>${esc(texto)}</p><div class="barra" style="justify-content:flex-end">
      <button class="btn" data-fechar>Cancelar</button><button class="btn primario perigo-sim">${esc(rotulo)}</button></div>`,
    { aoFechar: () => ok(false) });
    el.querySelector('.perigo-sim').onclick = () => { ok(true); fechar(); };
  });
}

export function selosTempos(m) {
  return (m.tempos || []).slice().sort((a, b) => ORDEM_TEMPOS.indexOf(a) - ORDEM_TEMPOS.indexOf(b))
    .map(t => `<span class="selo tempo" style="--cor:${COR_TEMPO[t]}">${esc(nomeTempo(t))}</span>`).join('');
}

export function itemMusica(m, { href = `#/musica/${m.chave}`, tom, extra = '', mostrarVersoes = true } = {}) {
  const t = tom ?? estado.tons[m.chave] ?? m.tom;
  return `<a class="item" href="${href}" data-chave="${esc(m.chave)}">
    <span class="tom">${esc(t || '—')}</span>
    <span class="info"><span class="nome">${m.numero ? m.numero + '. ' : ''}${esc(m.nome)}</span>
      ${m.complemento ? `<div class="comp">${esc(m.complemento)}</div>` : ''}
      <div class="selos">${selosTempos(m)}${m.origem === 'minha' ? '<span class="selo">minha</span>' : ''}${m.origem === 'pasta' ? '<span class="selo" title="Pasta de Cantos — versão simplificada">simplificada</span>' : ''}${mostrarVersoes && m.totalVersoes > 1 ? `<span class="selo versoes">${m.totalVersoes} versões</span>` : ''}${m.ocr ? (m.ocr.revisar ? '<span class="selo revisar" title="Convertida do PDF escaneado; há acordes a conferir">revisar</span>' : `<span class="selo" title="Convertida do PDF escaneado">${m.ocr.revisada ? 'revisada' : 'OCR'}</span>`) : ''}${m.daPartitura ? (m.daPartitura.revisar ? '<span class="selo revisar" title="Montada a partir da partitura; há pontos a conferir">revisar</span>' : '<span class="selo" title="Cifra montada a partir da partitura">da partitura</span>') : ''}${!m.chordpro ? (m.pdfImagem ? '<span class="selo" title="Cifra em imagem (PDF escaneado): não transpõe">escaneada</span>' : '<span class="selo">sem cifra</span>') : !m.temCifra ? '<span class="selo">só letra</span>' : ''}</div>
    </span>${extra}</a>`;
}

// Agrupa por inicial (ordem alfabética), ignorando acentos
export function listaAlfabetica(musicas, opcoes) {
  if (!musicas.length) return '<p class="vazio">Nenhuma música encontrada.</p>';
  const grupos = new Map();
  for (const m of musicas) {
    const l = (m.nome.normalize('NFD')[0] || '#').toUpperCase();
    const k = /[A-Z]/.test(l) ? l : '#';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(m);
  }
  return [...grupos].map(([l, ms]) => `<div class="letra-grupo">${l}</div><div>${ms.map(m => itemMusica(m, opcoes?.(m))).join('')}</div>`).join('');
}

export function baixarArquivo(nome, conteudo, tipo = 'application/json') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function salvarPrefsFonte() {
  salvarPrefs();
  document.documentElement.style.setProperty('--fonte-cifra', estado.prefs.fonte + 'px');
}

// Navega para uma rota; se já estiver nela, força o redesenho (o navegador não dispara hashchange)
export function irPara(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
