// Modo Tocar: apresenta a missa canto por canto, em tela cheia, com troca de tom e de versão na hora
import { estado, musica, versoes, salvarMissas } from './dados.js';
import { esc, aviso, modal, salvarPrefsFonte } from './ui.js';
import { painelCifra } from './app.js';
import { listaVersoes, personalizarItem } from './missas.js';

let travaTela = null;
let teclas = null;

async function manterTelaLigada() {
  try { travaTela = await navigator.wakeLock?.request('screen'); } catch { /* sem suporte */ }
}

export function sairTocar() {
  document.body.classList.remove('modo-tocar');
  if (teclas) { document.removeEventListener('keydown', teclas); teclas = null; }
  travaTela?.release?.().catch(() => {});
  travaTela = null;
}

export function telaTocar(tela, id, pos) {
  sairTocar();
  const x = estado.missas.find(y => y.id === id);
  if (!x) { tela.innerHTML = '<p class="vazio">Missa não encontrada.</p>'; return; }
  const lista = x.itens.filter(it => it.chave && musica(it.chave));
  if (!lista.length) {
    tela.innerHTML = `<p class="vazio">Esta missa ainda não tem cantos escolhidos.</p><p class="vazio"><a class="btn primario" href="#/missa/${esc(id)}">Montar a missa</a></p>`;
    return;
  }
  const i = Math.min(Math.max(+pos || 0, 0), lista.length - 1);
  const it = lista[i];
  const m = musica(it.chave);
  const salvar = () => { if (!salvarMissas()) aviso('Não foi possível salvar'); };
  const ir = n => { if (n >= 0 && n < lista.length) location.replace(`#/tocar/${id}/${n}`); };

  document.body.classList.add('modo-tocar');
  manterTelaLigada();

  tela.innerHTML = `
    <div class="tocar-topo nao-imprimir">
      <a class="btn peq" href="#/missa/${esc(id)}" title="Voltar à montagem">✕ Sair</a>
      <button class="btn peq" id="ant" ${i === 0 ? 'disabled' : ''} aria-label="Canto anterior">‹</button>
      <button class="btn peq tocar-indice" id="indice"><b>${i + 1}/${lista.length}</b> · ${esc(it.rotulo || '')}</button>
      <button class="btn peq" id="prox" ${i === lista.length - 1 ? 'disabled' : ''} aria-label="Próximo canto">›</button>
      <button class="btn peq" id="menos" aria-label="Diminuir letra">A−</button>
      <button class="btn peq" id="mais" aria-label="Aumentar letra">A+</button>
      <button class="btn peq" id="pers" title="Personalizar a cifra ou a letra (fica como versão personalizada)">✎</button>
    </div>
    <div class="tocar-titulo">
      <h1>${esc(m.nome)}</h1>
      ${m.complemento ? `<div class="suave pequeno">${esc(m.complemento)}</div>` : ''}
    </div>
    ${versoes(m).length > 1 ? `<div class="barra nao-imprimir"><button class="btn" id="versao">🎼 Versão ${m.versao} de ${m.totalVersoes} — trocar</button></div>` : ''}
    <div id="painel"></div>
    <div class="tocar-rodape nao-imprimir">
      ${i < lista.length - 1
        ? `<button class="btn primario" id="prox2">Próximo: ${esc(lista[i + 1].rotulo || '')} — ${esc(musica(lista[i + 1].chave).nome)} ›</button>`
        : '<a class="btn primario" href="#/missa/' + esc(id) + '">Fim da missa</a>'}
    </div>`;

  tela.querySelector('#painel').append(painelCifra(m, {
    tomAlvo: it.tom || estado.tons[m.chave] || m.tom,
    aoMudarTom: t => { it.tom = t === m.tom ? null : t; salvar(); },
  }));

  const $ = s => tela.querySelector(s);
  $('#ant').onclick = () => ir(i - 1);
  $('#prox').onclick = () => ir(i + 1);
  $('#prox2')?.addEventListener('click', () => { ir(i + 1); window.scrollTo(0, 0); });
  $('#menos').onclick = () => { estado.prefs.fonte = Math.max(11, estado.prefs.fonte - 1); salvarPrefsFonte(); };
  $('#mais').onclick = () => { estado.prefs.fonte = Math.min(48, estado.prefs.fonte + 1); salvarPrefsFonte(); };

  $('#pers').onclick = () => { sairTocar(); personalizarItem(x, x.itens.indexOf(it), `#/tocar/${id}/${i}`); };
  $('#indice').onclick = () => {
    const { el, fechar } = modal(`<div class="barra" style="justify-content:space-between;margin-top:0"><b>${esc(x.titulo)}</b><button class="btn peq" data-fechar>Fechar</button></div>
      ${lista.map((c, n) => `<button class="item" data-n="${n}" style="width:100%;text-align:left"><span class="tom">${esc(c.tom || estado.tons[c.chave] || musica(c.chave).tom || '—')}</span>
        <span class="info"><span class="parte pequeno suave">${esc(c.rotulo || '')}</span><div class="nome">${esc(musica(c.chave).nome)}</div></span>${n === i ? '<span class="selo">tocando</span>' : ''}</button>`).join('')}`);
    el.addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (b) { fechar(); ir(+b.dataset.n); } });
  };

  $('#versao')?.addEventListener('click', () => {
    const { el, fechar } = modal(`<div class="barra" style="justify-content:space-between;margin-top:0"><b>${esc(m.nome)}: qual versão?</b><button class="btn peq" data-fechar>Fechar</button></div><div id="v"></div>`);
    listaVersoes(el.querySelector('#v'), m, ch => {
      it.chave = ch; it.tom = null; salvar(); fechar(); location.replace(`#/tocar/${id}/${i}`);
      // mesma rota: força redesenho
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  });

  // Teclado (passa de canto com setas ou PageUp/PageDown em teclado de pedal) e deslizar o dedo
  teclas = e => {
    if (!location.hash.startsWith('#/tocar/') || e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' && e.shiftKey) ir(i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp' && e.shiftKey) ir(i - 1);
    else if (e.key === 'Escape' && !document.querySelector('.modal-fundo')) location.hash = '#/missa/' + id;
  };
  document.addEventListener('keydown', teclas);
  let x0 = null, y0 = null;
  tela.ontouchstart = e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; };
  tela.ontouchend = e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 2 && !e.target.closest('.tons')) ir(dx < 0 ? i + 1 : i - 1);
  };
}
