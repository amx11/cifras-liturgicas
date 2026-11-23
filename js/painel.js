// Painel à esquerda: a missa em montagem, sempre visível enquanto se escolhem os cantos
import { estado, musica, versoes, rotuloVersao } from './dados.js';
import { esc, modal, COR_TEMPO, nomeTempo } from './ui.js';
import { missaAtiva, definirAtiva, foco, definirFoco, removerCanto, novaMissa, personalizarItem, listaVersoes, salvarMissa } from './missas.js';
import { exportarMissa } from './exportar.js';

const painel = () => document.getElementById('painel-missa');

export function renderPainel() {
  const el = painel();
  if (!el) return;
  const x = missaAtiva();
  const missas = estado.missas.slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const seletor = `<select id="pn-troca" aria-label="Missa em montagem">
      ${x ? '' : '<option value="">Escolha uma missa…</option>'}
      ${missas.map(m => `<option value="${esc(m.id)}" ${x?.id === m.id ? 'selected' : ''}>${esc(m.titulo)}${m.data ? ' — ' + new Date(m.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}</option>`).join('')}
      <option value="__nova">＋ Nova missa…</option></select>`;
  atualizarBotao(x);

  if (!x) {
    el.innerHTML = `<div class="pn-cab"><b>Missa</b><button class="pn-fechar" data-pn="fechar" aria-label="Fechar painel">✕</button></div>
      ${missas.length ? seletor : ''}
      <p class="pequeno suave">Crie uma missa: o tempo litúrgico vem da data e a lista de cantos já fica filtrada. Depois é só tocar no <b>＋</b> de cada canto.</p>
      <button class="btn primario" data-pn="nova" style="width:100%">✚ Nova missa</button>`;
    return;
  }
  const feitos = x.itens.filter(it => it.chave && musica(it.chave)).length;
  el.innerHTML = `
    <div class="pn-cab"><b>Missa</b><button class="pn-fechar" data-pn="fechar" aria-label="Fechar painel">✕</button></div>
    ${seletor}
    <div class="pn-info">
      ${x.data ? `<span>${esc(new Date(x.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }))}</span>` : ''}
      ${x.tempo ? `<span class="selo tempo" style="--cor:${COR_TEMPO[x.tempo]}">${esc(nomeTempo(x.tempo))}</span>` : ''}
      ${x.ano ? `<span class="selo">${esc(estado.taxonomia.anos[x.ano] || '')}</span>` : ''}
      <span class="suave">${feitos}/${x.itens.length}</span>
    </div>
    <p class="pequeno suave pn-dica">${foco.idx != null && x.itens[foco.idx] ? `Escolhendo: <b>${esc(x.itens[foco.idx].rotulo)}</b>. Toque no <b>＋</b> de um canto.` : 'Toque numa parte para ver só os cantos dela.'}</p>
    <ol class="pn-lista">
      ${x.itens.map((it, i) => {
        const m = it.chave && musica(it.chave);
        const tom = m ? (it.tom || estado.tons[m.chave] || m.tom || '') : '';
        const nv = m ? versoes(m).length : 0;
        const reza = it.modo === 'rezada';
        return `<li class="pn-slot${foco.idx === i ? ' foco' : ''}${m && !reza ? '' : ' vazio'}${reza ? ' rezada' : ''}" data-i="${i}">
          <div class="pn-linha" data-pn="foco" role="button" tabindex="0" title="${foco.idx === i ? 'Parar de filtrar por esta parte' : 'Mostrar só os cantos desta parte'}">
            <span class="pn-parte">${esc(it.rotulo || 'Canto')}</span>
            ${reza ? '<span class="pn-nome suave">rezada</span>' : m ? `<a class="pn-nome" href="#/musica/${esc(m.chave)}">${esc(m.nome)}</a>` : '<span class="pn-nome suave">— escolher —</span>'}
            ${m && (nv > 1 || m.personalizada) ? `<span class="pn-versao">${esc(rotuloVersao(m).titulo)}</span>` : ''}
          </div>
          ${m && !reza ? `<div class="pn-acoes">
            ${tom ? `<span class="tom">${esc(tom)}</span>` : ''}
            ${nv > 1 ? '<button class="btn peq" data-pn="versao" title="Escolher outra versão (melodia)">🎼</button>' : ''}
            <button class="btn peq" data-pn="pers" title="Personalizar a cifra ou a letra">✎</button>
            <button class="btn peq" data-pn="tirar" title="Tirar o canto desta parte">✕</button>
          </div>` : ''}
        </li>`;
      }).join('')}
    </ol>
    <div class="pn-botoes">
      <a class="btn primario" href="#/tocar/${esc(x.id)}/0">▶ Tocar</a>
      <button class="btn" data-pn="pdf">⬇ PDF</button>
      <a class="btn" href="#/missa/${esc(x.id)}">Montar</a>
    </div>`;
}

function atualizarBotao(x) {
  const b = document.getElementById('fab-missa');
  if (!b) return;
  const feitos = x ? x.itens.filter(it => it.chave && musica(it.chave)).length : 0;
  // botão da missa fica no topo: nome curto da missa + quantos cantos já estão escolhidos
  b.innerHTML = x ? `<span aria-hidden="true">✚</span><span class="tm-nome">${esc(x.titulo || 'Missa')}</span><b>${feitos}/${x.itens.length}</b>` : '<span aria-hidden="true">✚</span><span class="tm-nome">Missa</span>';
  b.title = x ? `Missa em montagem: ${x.titulo || ''} (${feitos} de ${x.itens.length} cantos)` : 'Missa em montagem';
  b.setAttribute('aria-label', b.title);
}

export function abrirPainel(abrir = true) {
  document.body.classList.toggle('painel-aberto', abrir);
}

export function iniciarPainel() {
  const el = painel();
  el.addEventListener('change', e => {
    if (e.target.id !== 'pn-troca') return;
    if (e.target.value === '__nova') { renderPainel(); novaMissa(); return; }
    definirAtiva(e.target.value);
  });
  el.addEventListener('click', e => {
    const alvo = e.target.closest('[data-pn]');
    if (!alvo || e.target.closest('a.pn-nome')) return;
    const acao = alvo.dataset.pn;
    if (acao === 'fechar') return abrirPainel(false);
    if (acao === 'nova') return novaMissa();
    const x = missaAtiva(); if (!x) return;
    if (acao === 'pdf') return exportarMissa(x);
    const i = +alvo.closest('[data-i]')?.dataset.i;
    if (Number.isNaN(i)) return;
    if (acao === 'foco') {
      definirFoco(foco.idx === i ? null : i); renderPainel();
      if (window.innerWidth < 1000) abrirPainel(false);
      if (location.hash !== '#/musicas') location.hash = '#/musicas';
      return;
    }
    if (acao === 'tirar') return removerCanto(x, i);
    if (acao === 'pers') { abrirPainel(false); return personalizarItem(x, i); }
    if (acao === 'versao') {
      const it = x.itens[i], m = musica(it.chave);
      const { el: md, fechar } = modal(`<div class="barra" style="justify-content:space-between;margin-top:0"><b>${esc(m.nome)}: qual versão?</b><button class="btn peq" data-fechar>Fechar</button></div><div id="v"></div>`);
      listaVersoes(md.querySelector('#v'), m, ch => { it.chave = ch; it.tom = estado.tons[ch] || null; fechar(); salvarMissa(); });
    }
  });
  el.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-pn="foco"]')) { e.preventDefault(); e.target.click(); }
  });
  // nas telas com o painel (músicas, cifra) abre o painel; nas outras vai para a missa
  document.getElementById('fab-missa').onclick = () => {
    if (document.body.classList.contains('com-painel')) return abrirPainel(!document.body.classList.contains('painel-aberto'));
    const x = missaAtiva();
    location.hash = x ? `#/missa/${x.id}` : '#/missas';
  };
  document.getElementById('painel-fundo').onclick = () => abrirPainel(false);
  window.addEventListener('missa-mudou', renderPainel);
  window.addEventListener('foco-mudou', renderPainel);
  renderPainel();
}
