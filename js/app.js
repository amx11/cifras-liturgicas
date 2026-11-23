// Cifras Litúrgicas — rotas e telas principais (músicas, cifra, edição, ajustes)
import { estado, carregarAcervo, musica, buscar, versoes, rotuloVersao, salvarPrefs, salvarTons, editarMusica, desfazerEdicao,
  excluirMinha, salvarMinha, criarPersonalizada, salvarCorrecao, exportarBackup, importarBackup } from './dados.js';
import { renderizarHTML, renderizarTexto, semitonsEntre, preferirBemol, transporTom, textoParaChordPro,
  ehLinhaDeAcordes, chordproNoTom, transporAcorde } from './cifra.js';
import { esc, aviso, modal, confirmar, ORDEM_TEMPOS, ORDEM_PARTES, COR_TEMPO, nomeTempo, nomeParte,
  listaAlfabetica, itemMusica, baixarArquivo, irPara } from './ui.js';
import { telaMissas, telaMissa, escolherMissaPara, missaAtiva, foco, definirFoco, adicionarComAviso, listaVersoes, novaMissa, missaAutomatica } from './missas.js';
import { iniciarPainel, abrirPainel } from './painel.js';
import { desenharPDF } from './visualizar-pdf.js';
import { telaImportar } from './importar.js';
import { telaTocar, sairTocar } from './tocar.js';
import { telaOuvir, pararOuvir } from './ouvir.js';
import { telaAfinador, pararAfinador } from './afinador.js';
import { telaSumario } from './sumario.js';
import { INSTRUMENTOS, NIVEIS, cartaoAcorde, prepararAcordes } from './instrumentos.js';
import { iniciarNuvem, cartaoConta, cartaoMinisterio, acaoConta } from './nuvem.js';

const tela = document.getElementById('tela');
const TONS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// ---------- Preferências visuais ----------
export function aplicarPrefs() {
  const p = estado.prefs;
  document.documentElement.style.setProperty('--fonte-cifra', p.fonte + 'px');
  if (p.tema === 'auto') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.dataset.tema = p.tema;
  // cor da barra do sistema (Android / app instalado) acompanha o tema
  const escuro = p.tema === 'escuro' || (p.tema === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const cor = p.tema === 'ceu' ? '#2468b0' : escuro ? '#18201d' : '#2f5d50';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cor);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => aplicarPrefs());

// ---------- Topo: título da tela quando o título da página sai de vista ----------
let observaTitulo = null;
export function tituloNoTopo(h1, texto) {
  observaTitulo?.disconnect(); observaTitulo = null;
  const topo = document.querySelector('.topo');
  document.getElementById('topo-titulo').textContent = texto || '';
  topo.classList.remove('com-titulo');
  if (!h1 || !texto || !('IntersectionObserver' in window)) return;
  observaTitulo = new IntersectionObserver(([e]) => topo.classList.toggle('com-titulo', !e.isIntersecting && e.boundingClientRect.top < 0),
    { rootMargin: `-${topo.offsetHeight}px 0px 0px 0px` });
  observaTitulo.observe(h1);
}

// ---------- Painel de cifra (usado na tela da música e na missa) ----------
// tomAlvo: tom desejado; aoMudarTom(novoTom) é chamado quando o usuário troca
export function painelCifra(m, { tomAlvo, aoMudarTom, compacto = false } = {}) {
  const wrap = document.createElement('div');
  const original = m.tom || '';
  const menor = original.endsWith('m');
  let alvo = tomAlvo || original;

  const desenhar = () => {
    const semi = original && alvo ? semitonsEntre(original, alvo) : 0;
    const bemol = alvo ? preferirBemol(alvo) : false;
    const mostrar = estado.prefs.mostrarAcordes;
    const botoesTom = original ? TONS.map(t => {
      const tt = t + (menor ? 'm' : '');
      return `<button type="button" data-tom="${tt}" class="${tt === alvo ? 'atual' : ''} ${tt === original ? 'original' : ''}" title="${tt === original ? 'Tom original' : ''}">${tt}</button>`;
    }).join('') : '';
    wrap.innerHTML = `
      ${m.chordpro && original ? `<div class="controles nao-imprimir"${compacto ? ' style="position:static"' : ''}>
        <div class="tons" role="group" aria-label="Escolher tom">${botoesTom}<span class="tons-semi"><button type="button" data-semi="-1" title="Meio tom abaixo" aria-label="Meio tom abaixo">−½</button><button type="button" data-semi="1" title="Meio tom acima" aria-label="Meio tom acima">+½</button></span></div>
        </div>` : ''}
      ${m.chordpro && original ? `<div class="barra controles-extra nao-imprimir">
          <span class="instrumentos" role="group" aria-label="Ver os acordes no instrumento"><span class="pequeno suave">Acordes no:</span>${INSTRUMENTOS.map(([k, v]) => `<button type="button" class="btn peq${estado.prefs.instrumento === k ? ' primario' : ''}" data-instrumento="${k}" aria-pressed="${estado.prefs.instrumento === k}">${v}</button>`).join('')}${estado.prefs.instrumento ? '<button type="button" class="btn peq" data-instrumento="" title="Ocultar os desenhos dos acordes">✕ Ocultar</button>' : ''}</span>
          ${estado.prefs.instrumento ? `<span class="instrumentos niveis" role="group" aria-label="Nível">${NIVEIS.map(([k, v]) => `<button type="button" class="btn peq${(estado.prefs.nivel || 'medio') === k ? ' primario' : ''}" data-nivel="${k}" aria-pressed="${(estado.prefs.nivel || 'medio') === k}">${v}</button>`).join('')}</span>` : ''}
          <span class="pequeno suave">Original: <b>${esc(original)}</b>${m.outrosTons?.length ? ` (o PDF da arquidiocese traz também em ${m.outrosTons.map(esc).join(', ')})` : ''}${alvo !== original ? ` · ${capo(alvo)}` : ''}</span>
        </div>` : ''}
      ${m.chordpro && original && estado.prefs.instrumento ? `<div class="diagramas nao-imprimir" aria-label="Acordes da música no ${esc(INSTRUMENTOS.find(([k]) => k === estado.prefs.instrumento)?.[1] || '')}"><div class="barra" style="justify-content:space-between;margin:0 0 4px"><b class="pequeno">Acordes no ${esc(INSTRUMENTOS.find(([k]) => k === estado.prefs.instrumento)?.[1] || '')}</b><button type="button" class="btn peq" data-instrumento="">✕ Ocultar desenhos</button></div>${diagramas(acordesDaMusica(m.chordpro, semi, bemol), estado.prefs.instrumento)}</div>` : ''}
      ${m.museScore && !m.daPartitura?.formato?.startsWith('musescore') ? `<p class="pequeno suave nao-imprimir" style="margin:4px 0">✓ Acordes conferidos com o arquivo MuseScore da arquidiocese (acorde e sílaba nota a nota)${m.museScore.movidos ? ` — ${m.museScore.movidos} ${m.museScore.movidos === 1 ? 'acorde corrigido' : 'acordes corrigidos'}` : ''}${m.museScore.estrofes ? ` — acordes de ${m.museScore.estrofes} ${m.museScore.estrofes === 1 ? 'estrofe completados' : 'estrofes completados'}` : ''}.</p>` : ''}
      ${m.conferida && !m.daPartitura && !m.museScore ? `<p class="pequeno suave nao-imprimir" style="margin:4px 0">✓ Acordes conferidos com a partitura${m.conferida.movidos ? ` (${m.conferida.movidos} ${m.conferida.movidos === 1 ? 'acorde corrigido' : 'acordes corrigidos'} para a sílaba da nota)` : ''}.</p>` : ''}
      ${m.daPartitura && m.originalPdf ? `<div class="ocr-aviso nao-imprimir">
          <span>${m.daPartitura.transcrita ? (m.daPartitura.sugeridos ? '⚠ A partitura não traz acordes: os acordes desta cifra são sugeridos' : '🎼 Cifra transcrita da partitura' + (m.daPartitura.duvidas?.length ? ` — confira: <b>${esc(m.daPartitura.duvidas.join('; '))}</b>` : '')) : m.daPartitura.formato === 'musescore' ? '🎼 Cifra montada do arquivo MuseScore da arquidiocese (acorde e sílaba exatos, nota a nota)' : m.daPartitura.revisar ? '⚠ Cifra montada a partir da partitura, com pontos a conferir' : m.daPartitura.revisada ? '✓ Cifra montada a partir da partitura e revisada' : '🎼 Cifra montada a partir da partitura (acordes na sílaba da nota)'}.</span>
          <button type="button" class="btn peq" data-ver-original>Ver original</button>
          ${m.origem === 'arquipoa' ? `<button type="button" class="btn peq${m.daPartitura.revisar ? ' primario' : ''}" data-revisar>Revisar</button>` : ''}
        </div><div class="original-escaneado" hidden></div>` : ''}
      ${m.ocr && m.pdfImagem ? `<div class="ocr-aviso nao-imprimir">
          <span>${m.ocr.revisar ? '⚠ Convertida automaticamente do PDF escaneado, com acordes a conferir' + (m.ocr.duvidas?.length ? `: <b>${esc(m.ocr.duvidas.slice(0, 6).join(', '))}</b>` : '') : m.ocr.revisada ? '✓ Convertida do PDF escaneado e revisada' : 'Convertida automaticamente do PDF escaneado'}.</span>
          <button type="button" class="btn peq" data-ver-original>Ver original</button>
          ${m.origem === 'arquipoa' ? `<button type="button" class="btn peq${m.ocr.revisar ? ' primario' : ''}" data-revisar>Revisar</button>` : ''}
        </div><div class="original-escaneado" hidden></div>` : ''}
      ${m.cabecalho?.length ? `<div class="cabecalho">${m.cabecalho.map(esc).join('<br>')}</div>` : ''}
      ${m.chordpro ? `<div class="cifra${estado.prefs.mono ? ' mono' : ''}">${renderizarHTML(m.chordpro, { semitons: semi, bemol, mostrarAcordes: mostrar })}</div>`
        : m.pdfImagem ? `<p class="escaneada-aviso nao-imprimir">Cifra escaneada (imagem do PDF original): aparece como no papel e <b>não dá para trocar o tom</b>. Para transpor, digite a cifra olhando o original.${m.origem === 'arquipoa' ? ' <button type="button" class="btn peq primario" data-revisar>✎ Digitar a cifra</button>' : ''}</p><div class="escaneada"></div>`
        : `<p class="vazio">Esta música não tem cifra nem letra no acervo.${m.partitura ? ' Veja a partitura.' : ''}</p>`}`;
    const esc_ = wrap.querySelector('.escaneada');
    if (esc_) requestAnimationFrame(() => desenharPDF(m.pdfImagem, esc_));
    // tom escolhido sempre à vista na faixa de tons (o meio tom fica preso à direita)
    requestAnimationFrame(() => {
      const faixa = wrap.querySelector('.tons'), atual = faixa?.querySelector('.atual');
      if (!atual || faixa.scrollWidth <= faixa.clientWidth) return;
      const semi = faixa.querySelector('.tons-semi')?.offsetWidth || 0;
      const fr = faixa.getBoundingClientRect(), ar = atual.getBoundingClientRect();
      faixa.scrollLeft += (ar.left + ar.width / 2) - (fr.left + (fr.width - semi) / 2);
    });
  };
  wrap.addEventListener('click', e => {
    // tocar no nome do acorde na cifra: mostra o desenho dele (no instrumento escolhido; sem escolha, no violão)
    const ac = e.target.closest('.cifra .ac');
    if (ac) {
      const semi = original && alvo ? semitonsEntre(original, alvo) : 0;
      const seq = acordesDaMusica(m.chordpro || '', semi, preferirBemol(alvo || original));
      const nome = ac.textContent.trim().replace(/^\(|\)$/g, '');
      const inst = estado.prefs.instrumento || 'violao';
      modal(`<div class="barra" style="justify-content:space-between;margin-top:0"><b>${esc(nome)}</b><button class="btn peq" data-fechar>Fechar</button></div>
        ${diagramas(seq.includes(nome) ? seq : [nome], inst, nome)}
        <p class="pequeno suave">Escolha o instrumento em “Acordes no:”, em cima da cifra.</p>`);
      return;
    }
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.nivel) { estado.prefs.nivel = b.dataset.nivel; salvarPrefs(); desenhar(); return; }
    if (b.dataset.instrumento !== undefined) {
      estado.prefs.instrumento = !b.dataset.instrumento || estado.prefs.instrumento === b.dataset.instrumento ? null : b.dataset.instrumento;
      salvarPrefs(); desenhar(); return;
    }
    if (b.hasAttribute('data-ver-original')) {
      const box = wrap.querySelector('.original-escaneado');
      box.hidden = !box.hidden;
      b.textContent = box.hidden ? 'Ver original' : 'Esconder original';
      if (!box.hidden && !box.childElementCount) desenharPDF(m.daPartitura && m.originalPdf ? m.originalPdf : m.pdfImagem, box);
      return;
    }
    if (b.hasAttribute('data-revisar')) { location.hash = '#/revisar/' + m.chave; return; }
    if (b.dataset.tom) alvo = b.dataset.tom;
    else if (b.dataset.semi) alvo = transporTom(alvo, +b.dataset.semi);
    else return;
    desenhar();
    aoMudarTom?.(alvo);
  });
  wrap.texto = () => renderizarTexto(m.chordpro || '', { semitons: semitonsEntre(original, alvo), bemol: preferirBemol(alvo), mostrarAcordes: estado.prefs.mostrarAcordes });
  wrap.tom = () => alvo;
  desenhar();
  return wrap;
}

// Acordes da música, na ordem em que aparecem, já no tom escolhido (sem repetir; sem "/F" de baixo sozinho)
function acordesDaMusica(chordpro, semi, bemol) {
  const seq = [];
  for (const x of chordpro.matchAll(/\[([^\]]+)\]/g)) {
    const a = x[1].trim().replace(/^\(|\)$/g, '');
    if (!/^[A-G]/.test(a)) continue;
    seq.push(transporAcorde(a, semi, bemol));
  }
  return seq;
}
// cartões dos acordes no instrumento e no nível escolhidos; o que depende da ordem da música (inversão mais perto do
// acorde anterior, região do braço, linha da flauta) é calculado pela sequência inteira
const LEGENDAS = {
  violao: { simples: 'Simplificado: acorde básico (sem 7ª, 9ª...), sem pestana.', medio: 'Médio: o acorde como está escrito, nas formas mais usadas.', avancado: 'Avançado: o acorde completo, com a mão ficando na mesma região do braço de um acorde para o outro.' },
  teclado: { simples: '<span class="cor-me">■ mão esquerda: só o baixo</span> <span class="cor-md">■ mão direita: acorde básico (3 notas)</span>', medio: '<span class="cor-me">■ mão esquerda: tônica, 5ª e 8ª</span> <span class="cor-md">■ mão direita: o acorde com a 7ª</span>', avancado: '<span class="cor-me">■ mão esquerda: tônica, 5ª e 10ª</span> <span class="cor-md">■ mão direita: todas as notas escritas (7ª, 9ª, 6ª...)</span>' },
  orgao: { simples: '<span class="cor-pedal">■ pedal</span> <span class="cor-me">■ mão esquerda: acorde básico</span> · mão direita livre para a melodia', medio: '<span class="cor-pedal">■ pedal</span> <span class="cor-me">■ mão esquerda: acorde com a 7ª</span> · mão direita livre para a melodia', avancado: '<span class="cor-pedal">■ pedal</span> <span class="cor-me">■ mão esquerda: acorde</span> <span class="cor-md">■ mão direita: o mesmo acorde uma oitava acima (som cheio)</span>' },
  flauta: { simples: 'Simplificado: uma nota por acorde, a mais perto da anterior (contracanto). ', medio: 'Médio: arpejo do acorde básico (1-3-5). ', avancado: 'Avançado: arpejo completo (7ª, 9ª...) e a oitava. ' },
};
LEGENDAS.transversal = LEGENDAS.flauta;
const DIGITACOES = {
  flauta: 'Flauta doce soprano, digitação barroca: ● tapado ○ aberto ◐ meio; o 1º furo é o do polegar (atrás).',
  transversal: 'Flauta transversal (sistema Boehm): ● apertado ○ solto. De cima para baixo: polegar (à esquerda), 3 dedos da mão esquerda, chave de Sol# (mindinho esquerdo), 3 dedos da mão direita, chave de Mi♭ (mindinho direito) e, embaixo, as chaves do pé (Dó# e Dó). Na 2ª oitava a posição é a mesma, soprando mais — menos Ré e Mi♭, que levantam o 1º dedo.',
};
function diagramas(seq, instrumento, so = null) {
  const nivel = estado.prefs.nivel || 'medio';
  const ctx = prepararAcordes(seq, instrumento, nivel);
  const distintos = so ? [so] : [...new Set(seq)];
  const legenda = `<div class="pequeno suave legenda-cores">${LEGENDAS[instrumento]?.[nivel] || ''}${DIGITACOES[instrumento] || ''}</div>`;
  return `${legenda}<div class="lista-acordes">${distintos.map(n => cartaoAcorde(n, instrumento, ctx)).join('')}</div>`;
}

// Sugestão de capotraste: formas fáceis (C, G, D, A, E / Am, Em, Dm) com capotraste até a 5ª casa
function capo(alvo) {
  const menor = alvo.endsWith('m');
  const formas = menor ? ['Am', 'Em', 'Dm'] : ['G', 'C', 'D', 'A', 'E'];
  const raiz = alvo.replace(/m$/, '');
  if (formas.some(f => f.replace(/m$/, '') === raiz)) return 'sem capotraste';
  for (const f of formas) {
    const casa = semitonsEntre(f, alvo);
    if (casa >= 1 && casa <= 5) return `capotraste na ${casa}ª casa, tocando em ${f}`;
  }
  return 'sem capotraste simples neste tom';
}

// ---------- Tela: lista de músicas ----------
const filtro = (() => { try { return JSON.parse(sessionStorage.getItem('cl.filtro')) || {}; } catch { return {}; } })();
const guardarFiltro = () => { try { sessionStorage.setItem('cl.filtro', JSON.stringify(filtro)); } catch {} };

// Marca da missa ativa: quando muda (outra missa, outra data/tempo), o filtro de tempo é refeito
const marcaMissa = x => (x ? `${x.id}|${x.tempo}` : '');

function telaMusicas() {
  const tx = estado.taxonomia;
  const x = missaAtiva();
  if (x && filtro.autoDe !== marcaMissa(x)) { filtro.autoDe = marcaMissa(x); filtro.tempo = x.tempo ?? null; filtro.parte = null; filtro.autoParte = null; }
  if (!x) filtro.autoDe = null;
  // Parte em foco no painel: filtra só os cantos dela
  const slot = x && foco.idx != null ? x.itens[foco.idx] : null;
  const marcaParte = slot ? `${x.id}:${foco.idx}:${slot.parte}` : null;
  if (marcaParte !== (filtro.autoParte ?? null)) {
    if (slot) filtro.parte = slot.parte ?? null; else if (filtro.autoParte) filtro.parte = null;
    filtro.autoParte = marcaParte;
  }
  tela.innerHTML = `
    <div class="barra" style="justify-content:space-between;align-items:center;margin:0"><h1 style="margin:0">Músicas</h1>
      <a class="btn primario" href="#/importar" title="Digitar, colar, ou ler de foto, PDF, partitura, áudio ou YouTube">✚ Colocar cifra</a></div>
    ${x ? `<div class="montando"><span>Montando <b>${esc(x.titulo)}</b>${slot ? ` · escolhendo <b>${esc(slot.rotulo)}</b>` : ''}</span>
      <span class="suave">Toque no <b>＋</b> para pôr o canto na missa.</span>
      ${slot ? '<button class="chip" id="sem-foco">Ver todas as partes</button>' : ''}</div>`
      : `<div class="montando"><span>Para montar uma missa, crie uma: o tempo litúrgico vem da data.</span><button class="chip" id="criar-missa">✚ Nova missa</button></div>`}
    <input type="search" id="busca" placeholder="Buscar por título ou trecho da letra" value="${esc(filtro.termo || '')}" autocomplete="off">
    <div class="chips" role="group" aria-label="Tempo litúrgico">
      <button class="chip" data-tempo="" aria-pressed="${filtro.tempo == null}">Todos</button>
      ${ORDEM_TEMPOS.filter(t => tx.tempos[t]).map(t => `<button class="chip" data-tempo="${t}" style="--cor:${COR_TEMPO[t]}" aria-pressed="${filtro.tempo === t}">${esc(tx.tempos[t])}</button>`).join('')}
    </div>
    <div class="filtros">
      <select id="parte" aria-label="Parte da missa"><option value="">Todas as partes da missa</option>
        ${ORDEM_PARTES.filter(p => tx.partes[p]).map(p => `<option value="${p}" ${filtro.parte === p ? 'selected' : ''}>${esc(tx.partes[p])}</option>`).join('')}</select>
      <select id="ano" aria-label="Ano litúrgico"><option value="">Todos os anos (A, B, C)</option>
        ${Object.entries(tx.anos).map(([k, v]) => `<option value="${k}" ${filtro.ano === +k ? 'selected' : ''}>${esc(v)}</option>`).join('')}
        <option value="minha" ${filtro.origem === 'minha' ? 'selected' : ''}>Só as minhas músicas</option>
        <option value="pasta" ${filtro.origem === 'pasta' ? 'selected' : ''}>Só a Pasta de Cantos (simplificadas)</option>
        <option value="revisar" ${filtro.revisar ? 'selected' : ''}>Convertidas automaticamente: para revisar</option>
        <option value="ocr" ${filtro.ocr ? 'selected' : ''}>Convertidas do escaneado: todas</option>
        <option value="partitura" ${filtro.partitura ? 'selected' : ''}>Montadas a partir da partitura</option></select>
    </div>
    <p class="pequeno suave" id="contagem"></p>
    <div id="resultados"></div>
    ${!estado.base?.length ? `<div class="cartao">O acervo da arquidiocese ainda não foi importado. Rode <code>node tools/importar-arquipoa.mjs</code> na pasta do projeto, ou adicione músicas pela aba <a href="#/importar">Importar</a>.</div>` : ''}`;

  const atualizar = () => {
    let res = buscar({ termo: filtro.termo, tempo: filtro.tempo ?? null, parte: filtro.parte ?? null, ano: filtro.ano ?? null, origem: filtro.origem, agrupar: !(filtro.revisar || filtro.ocr || filtro.partitura) });
    const parcial = res.parcial;
    if (filtro.revisar) res = res.filter(m => m.ocr?.revisar || m.daPartitura?.revisar);
    if (filtro.ocr) res = res.filter(m => m.ocr);
    if (filtro.partitura) res = res.filter(m => m.daPartitura);
    document.getElementById('contagem').textContent = `${res.length} ${res.length === 1 ? 'música' : 'músicas'}${parcial ? ' com parte das palavras (nenhuma tem todas)' : ''}`;
    // Com busca por texto, mantém a ordem de relevância; sem busca, ordem alfabética com letras
    const opcoes = m => ({ extra: x ? `<button class="add-missa" data-add="${esc(m.chave)}" title="Pôr na missa${slot ? ' (' + esc(slot.rotulo) + ')' : ''}" aria-label="Pôr ${esc(m.nome)} na missa">＋</button>` : '' });
    document.getElementById('resultados').innerHTML = filtro.termo
      ? (res.length ? res.slice(0, 300).map(m => itemMusica(m, opcoes(m))).join('') : '<p class="vazio">Nenhuma música encontrada.</p>')
      : listaAlfabetica(res, opcoes);
    guardarFiltro();
  };
  let espera;
  tela.querySelector('#busca').addEventListener('input', e => { filtro.termo = e.target.value; clearTimeout(espera); espera = setTimeout(atualizar, 150); });
  tela.querySelector('.chips').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    filtro.tempo = c.dataset.tempo ? +c.dataset.tempo : null;
    tela.querySelectorAll('.chips .chip').forEach(x => x.setAttribute('aria-pressed', x === c));
    atualizar();
  });
  tela.querySelector('#parte').onchange = e => { filtro.parte = e.target.value ? +e.target.value : null; atualizar(); };
  tela.querySelector('#sem-foco')?.addEventListener('click', () => definirFoco(null));
  tela.querySelector('#criar-missa')?.addEventListener('click', () => novaMissa());
  // ＋ ao lado de cada canto: põe na missa ativa (pergunta a versão quando houver mais de uma)
  tela.querySelector('#resultados').addEventListener('click', e => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const ativa = missaAtiva(); if (!ativa) return;
    const m = musica(b.dataset.add);
    if (versoes(m).length < 2) { adicionarComAviso(ativa, m); return; }
    const { el, fechar } = modal(`<div class="barra" style="justify-content:space-between;margin-top:0"><b>${esc(m.nome)}: qual versão?</b><button class="btn peq" data-fechar>Fechar</button></div>
      <p class="pequeno suave">Esta letra tem ${versoes(m).length} versões (melodias). Compare o começo de cada uma:</p><div id="v"></div>`);
    listaVersoes(el.querySelector('#v'), m, ch => { fechar(); adicionarComAviso(ativa, musica(ch)); });
  });
  tela.querySelector('#ano').onchange = e => {
    const v = e.target.value;
    filtro.origem = v === 'minha' || v === 'pasta' ? v : null;
    filtro.revisar = v === 'revisar'; filtro.ocr = v === 'ocr'; filtro.partitura = v === 'partitura';
    filtro.ano = /^\d+$/.test(v) ? +v : null;
    atualizar();
  };
  atualizar();
}

// ---------- Tela: uma música ----------
function telaMusica(chave) {
  const m = musica(chave);
  if (!m) { tela.innerHTML = '<p class="vazio">Música não encontrada.</p>'; return; }
  const partes = (m.partes || []).map(nomeParte).filter(Boolean).join(' · ');
  tela.innerHTML = `
    <div class="cifra-topo">
      <div><h1>${m.num ? `<span class="num">${m.num}</span> ` : ''}${esc(m.nome)} <button class="btn peq nao-imprimir" id="renomear" title="Editar o nome e a linha de baixo (autor, complemento)">✎ Nome</button></h1>
        ${m.complemento ? `<div class="suave">${esc(m.complemento)}</div>` : ''}
        <div class="pequeno suave">${esc((m.tempos || []).map(nomeTempo).join(' · '))}${partes ? ' — ' + esc(partes) : ''}</div></div>
    </div>
    ${barraVersoes(m)}
    <div class="barra barra-cifra nao-imprimir">
      <button class="btn primario" id="add-missa">✚ Pôr na missa</button>
      <span class="segmento" role="group" aria-label="Tamanho da letra">
        <button class="btn" id="fonte-menos" aria-label="Diminuir letra" title="Diminuir letra">A−</button>
        <span class="seg-valor" id="fonte-valor" aria-live="polite">${estado.prefs.fonte}</span>
        <button class="btn" id="fonte-mais" aria-label="Aumentar letra" title="Aumentar letra">A+</button>
      </span>
      <button class="btn" id="acordes" aria-pressed="${!estado.prefs.mostrarAcordes}">${estado.prefs.mostrarAcordes ? 'Ocultar acordes' : 'Mostrar acordes'}</button>
      <button class="btn" id="rolar">▶ Rolar</button>
      <details class="menu-mais">
        <summary class="btn" aria-label="Mais opções">⋯ Mais</summary>
        <div class="menu">
          <button type="button" class="menu-item" id="copiar">Copiar a cifra</button>
          <button type="button" class="menu-item" id="editar" title="${m.origem === 'minha' ? 'Editar esta música' : 'Alterar a cifra ou a letra; fica salva como versão personalizada e o original não muda'}">✎ ${m.origem === 'minha' ? 'Editar' : 'Personalizar'}</button>
          ${m.pdf ? `<a class="menu-item" href="${esc(m.pdf)}" target="_blank" rel="noopener">PDF da arquidiocese ↗</a>` : ''}
          ${m.partituraLocal ? '<button type="button" class="menu-item" id="ver-partitura">Partitura</button>' : m.partitura ? `<a class="menu-item" href="${esc(m.partitura)}" target="_blank" rel="noopener">Partitura no site ↗</a>` : ''}
          ${m.youtube ? `<button type="button" class="menu-item" id="yt">Vídeo do YouTube</button>` : ''}
          ${(m.audios || (m.audio ? [m.audio] : [])).map((u, i, l) => `<button type="button" class="menu-item" data-audio="${esc(u)}">Ouvir o áudio${l.length > 1 ? ' ' + (i + 1) : ''}</button><a class="menu-item" href="${esc(u)}" target="_blank" rel="noopener">Abrir o áudio${l.length > 1 ? ' ' + (i + 1) : ''} ↗${m.audioQuebrado ? ' (erro no site da arquidiocese)' : ''}</a>`).join('')}
        </div>
      </details>
    </div>
    <div id="midia"></div>
    <div id="partitura-box" class="cartao nao-imprimir" hidden><div class="barra" style="justify-content:space-between;margin:0 0 8px"><b>Partitura</b>
      ${m.partitura ? `<a class="pequeno" href="${esc(m.partitura)}" target="_blank" rel="noopener">abrir no site da arquidiocese ↗</a>` : ''}</div><div id="partitura-pdf"></div></div>
    <div id="painel"></div>`;
  const painel = painelCifra(m, {
    tomAlvo: estado.tons[chave],
    aoMudarTom: t => { if (t === m.tom) delete estado.tons[chave]; else estado.tons[chave] = t; salvarTons(); },
  });
  tela.querySelector('#painel').append(painel);
  const redesenhar = () => telaMusica(chave);

  tela.querySelector('#renomear').onclick = () => {
    const ed = estado.edicoes[m.chave] || {};
    const mudou = ed.nome != null || ed.complemento != null;
    const { el, fechar } = modal(`<h2 style="margin-top:0">Nome da música</h2>
      <label class="campo"><span>Nome</span><input type="text" id="n-nome" value="${esc(m.nome)}"></label>
      <label class="campo"><span>Linha de baixo (autor, intérprete, complemento)</span><input type="text" id="n-comp" value="${esc(m.complemento || '')}"></label>
      <p class="pequeno suave">Vale para a busca, a lista, as missas e os slides. Fica salvo neste aparelho (vai junto no backup).</p>
      <div class="barra" style="justify-content:space-between">
        ${mudou ? '<button class="btn" id="n-original">Voltar ao original</button>' : '<span></span>'}
        <span><button class="btn" data-fechar>Cancelar</button> <button class="btn primario" id="n-ok">Salvar</button></span>
      </div>`);
    el.querySelector('#n-nome').focus();
    el.querySelector('#n-ok').onclick = () => {
      const nome = el.querySelector('#n-nome').value.trim(), complemento = el.querySelector('#n-comp').value.trim();
      if (!nome) { aviso('O nome não pode ficar vazio'); return; }
      if (!editarMusica(m.chave, { nome, complemento })) { aviso('Não foi possível salvar'); return; }
      fechar(); aviso('Nome salvo'); telaMusica(m.chave);
    };
    el.querySelector('#n-original')?.addEventListener('click', async () => {
      if (m.origem === 'minha') return;
      const e2 = { ...(estado.edicoes[m.chave] || {}) }; delete e2.nome; delete e2.complemento;
      if (Object.keys(e2).filter(k => !['tom', 'temCifra'].includes(k)).length) { estado.edicoes[m.chave] = e2; editarMusica(m.chave, {}); }
      else await desfazerEdicao(m.chave);
      fechar(); aviso('Nome original de volta'); telaMusica(m.chave);
    });
  };
  tela.querySelector('#add-missa').onclick = () => {
    const ativa = missaAtiva();
    if (ativa) adicionarComAviso(ativa, m, painel.tom()); else escolherMissaPara(m, painel.tom());
  };
  const mudarFonte = d => { estado.prefs.fonte = Math.min(40, Math.max(11, estado.prefs.fonte + d)); salvarPrefs(); aplicarPrefs(); tela.querySelector('#fonte-valor').textContent = estado.prefs.fonte; };
  tela.querySelector('#fonte-menos').onclick = () => mudarFonte(-1);
  tela.querySelector('#fonte-mais').onclick = () => mudarFonte(1);
  const mais = tela.querySelector('.menu-mais');
  mais.addEventListener('click', e => { if (e.target.closest('.menu-item')) mais.open = false; });
  tituloNoTopo(tela.querySelector('h1'), `${m.num ? m.num + ' · ' : ''}${m.nome}`);
  tela.querySelector('#acordes').onclick = () => { estado.prefs.mostrarAcordes = !estado.prefs.mostrarAcordes; salvarPrefs(); redesenhar(); };
  const btPart = tela.querySelector('#ver-partitura');
  if (btPart) btPart.onclick = () => {
    const box = tela.querySelector('#partitura-box');
    box.hidden = !box.hidden;
    btPart.textContent = box.hidden ? 'Partitura' : 'Esconder partitura';
    if (!box.hidden && !tela.querySelector('#partitura-pdf').childElementCount) desenharPDF(m.partituraLocal, tela.querySelector('#partitura-pdf'));
    if (!box.hidden) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  tela.querySelector('#copiar').onclick = async () => {
    const texto = `${m.nome}${painel.tom() ? ` (${painel.tom()})` : ''}\n\n${painel.texto()}`;
    try { await navigator.clipboard.writeText(texto); aviso('Cifra copiada'); } catch { aviso('Não foi possível copiar'); }
  };
  tela.querySelector('#editar').onclick = () => {
    if (m.origem === 'minha') { location.hash = `#/editar/${chave}`; return; }
    // Personalizar começa no tom que está na tela
    telaEditar(chave, { chordpro: chordproNoTom(m.chordpro, m.tom, painel.tom()) }, { tomAtual: painel.tom(), voltar: '#/musica/' + chave });
    window.scrollTo(0, 0);
  };
  tela.querySelector('.versoes-barra')?.addEventListener('click', e => {
    const b = e.target.closest('[data-versao]'); if (!b) return;
    location.replace('#/musica/' + b.dataset.versao);
  });
  tela.querySelector('#yt')?.addEventListener('click', () => {
    tela.querySelector('#midia').innerHTML = `<div class="cartao" style="padding:0;overflow:hidden"><iframe style="width:100%;aspect-ratio:16/9;border:0;display:block" src="https://www.youtube-nocookie.com/embed/${esc(m.youtube)}${m.youtubeInicio ? '?start=' + m.youtubeInicio : ''}" allow="encrypted-media; picture-in-picture" allowfullscreen title="Vídeo da música"></iframe></div>`;
  });
  tela.querySelectorAll('[data-audio]').forEach(b => b.addEventListener('click', () => {
    tela.querySelector('#midia').innerHTML = `<audio controls autoplay src="${esc(b.dataset.audio)}" style="width:100%"></audio>`;
  }));
  rolagem(tela.querySelector('#rolar'));
}

// Seletor de versões (mesma música com melodias diferentes)
export function barraVersoes(m, { classe = '' } = {}) {
  const vs = versoes(m);
  if (vs.length < 2) return '';
  return `<div class="versoes-barra nao-imprimir ${classe}" role="group" aria-label="Versões">
    <span class="pequeno suave">${vs.length} versões:</span>
    ${vs.map(v => { const r = rotuloVersao(v); return `<button type="button" class="versao${v.chave === m.chave ? ' atual' : ''}" data-versao="${esc(v.chave)}" title="${esc(r.desc)}">
      <b>${esc(r.titulo)}</b>${v.tom ? ` <span class="tom-mini">${esc(estado.tons[v.chave] || v.tom)}</span>` : ''}
      <span class="desc">${esc(r.desc || r.acordes)}</span></button>`; }).join('')}
  </div>`;
}

// Rolagem automática para tocar sem mãos; velocidade ajustável tocando de novo
let rolando = null;
function rolagem(botao) {
  const velocidades = [0, 18, 30, 45, 70];
  let v = 0;
  botao.onclick = () => {
    v = (v + 1) % velocidades.length;
    cancelAnimationFrame(rolando);
    botao.textContent = v ? `⏸ Rolar ${v}x` : '▶ Rolar';
    if (!v) return;
    let ultimo = performance.now(), acumulado = 0;
    const passo = agora => {
      acumulado += (agora - ultimo) / 1000 * velocidades[v];
      ultimo = agora;
      if (acumulado >= 1) { window.scrollBy(0, Math.floor(acumulado)); acumulado %= 1; }
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 2) { botao.textContent = '▶ Rolar'; v = 0; return; }
      rolando = requestAnimationFrame(passo);
    };
    rolando = requestAnimationFrame(passo);
  };
}

// ---------- Tela: editar / nova música ----------
// opts: { aposSalvar(chave), voltar: '#/rota', tomAtual }
export function telaEditar(chave, inicial = {}, opts = {}) {
  const m = chave ? musica(chave) : null;
  const revisar = !!(opts.revisar && m?.origem === 'arquipoa');  // corrigir a conversão do escaneado (vale para todos)
  const derivada = !!m && m.origem !== 'minha' && !revisar; // personalizar uma música do acervo: cria uma versão nova
  const d = { nome: '', complemento: '', chordpro: '', tempos: [], partes: [], cabecalho: [], ...(m || {}), ...inicial };
  if (derivada && !inicial.complemento) d.complemento = 'Versão personalizada';
  const lido = opts.original?.length ? opts.original : null; // imagens da foto/PDF lido pelo OCR (música nova)
  const original = revisar ? (m.pdfImagem && m.ocr ? m.pdfImagem : m.originalPdf || m.pdfImagem) : null;
  const lado = original || lido;
  // pontos duvidosos com lugar no original (OCR): recorte ampliado de cada um
  const pontos = (original && m.ocr ? m.ocr?.locais : lido ? opts.locais : null) || [];
  const fonte = original ? { pdf: original } : lido ? { imagens: lido } : null;
  const tx = estado.taxonomia;
  const marcadores = (campo, ordem, nomes) => ordem.filter(i => nomes[i]).map(i =>
    `<label class="chip" style="display:inline-flex;gap:6px;margin:2px"><input type="checkbox" name="${campo}" value="${i}" ${d[campo].includes(i) ? 'checked' : ''}>${esc(nomes[i])}</label>`).join('');
  tela.innerHTML = `
    <h1>${revisar ? 'Revisar conversão' : derivada ? 'Personalizar música' : m ? (m.personalizada ? 'Editar versão personalizada' : 'Editar música') : 'Nova música'}</h1>
    ${derivada ? `<p class="cartao pequeno">Você está criando uma <b>versão personalizada</b>: mude a letra, os acordes ou ambos. O original continua igual, e as duas aparecem como versões da mesma música.${opts.tomAtual ? ` A cifra abaixo já está no tom <b>${esc(opts.tomAtual)}</b>.` : ''}</p>` : ''}
    ${revisar ? `<p class="cartao pequeno">Compare com o original escaneado ao lado e corrija letra e acordes. A prévia embaixo mostra como vai ficar.
      ${m.ocr?.duvidas?.length ? `<br>Leituras duvidosas: <b>${esc(m.ocr.duvidas.join(', '))}</b>` : ''}</p>` : ''}
    ${lido ? `<p class="cartao pequeno">Cifra lida da ${opts.origemLida || 'imagem'}. Confira com o original ao lado: a leitura automática pode errar algum acorde ou letra. A prévia embaixo mostra como vai ficar.
      ${opts.duvidas?.length ? `<br>Leituras duvidosas: <b>${esc(opts.duvidas.join(', '))}</b>` : '<br>Nenhum acorde duvidoso.'}</p>` : ''}
    <div class="${lado ? 'revisao' : ''}">
    <form id="f">
      <label class="campo"><span>Título</span><input type="text" name="nome" required value="${esc(d.nome)}"></label>
      <label class="campo"><span>Complemento (autor, observação)</span><input type="text" name="complemento" value="${esc(d.complemento)}"></label>
      <details class="campo" ${revisar ? '' : 'open'}><summary class="pequeno suave">Tempos litúrgicos e partes da missa</summary>
      <div class="campo"><span class="pequeno suave">Tempos litúrgicos</span><div>${marcadores('tempos', ORDEM_TEMPOS, tx.tempos)}</div></div>
      <div class="campo"><span class="pequeno suave">Partes da missa</span><div>${marcadores('partes', ORDEM_PARTES, tx.partes)}</div></div>
      </details>
      <label class="campo"><span>Cifra em ChordPro (acordes entre colchetes: <code>[G]Senhor, ten[D]de piedade</code>). Pode colar também cifra com acordes em cima da letra.</span>
        <textarea name="chordpro" spellcheck="false">${esc(d.chordpro)}</textarea></label>
      <div class="barra">
        <button class="btn primario" type="submit">${revisar ? '✓ Salvar correção' : derivada ? 'Salvar versão personalizada' : 'Salvar'}</button>
        <button class="btn" type="button" id="converter">Converter acordes em cima da letra</button>
        ${!m ? '<label class="btn">📷 Ler de foto ou PDF<input type="file" id="ler-foto" accept="image/*,application/pdf,.pdf" multiple hidden></label>' : ''}
        <button class="btn" type="button" id="previa">Pré-visualizar</button>
        ${m?.origem === 'minha' ? '<button class="btn perigo" type="button" id="excluir">Excluir</button>' : ''}
        <button class="btn" type="button" id="cancelar">Cancelar</button>
      </div>
      ${pontos.length ? `<details class="cartao conferir" open><summary><b>Pontos a conferir (${pontos.length})</b> <span class="pequeno suave">— trecho ampliado do original; a seta mostra o acorde</span></summary>
      <div class="pequeno suave">Compare cada trecho com a cifra e corrija no campo acima se precisar. Marque ✓ ao conferir.</div>
      ${pontos.map((pt, i) => `<div class="ponto" data-i="${i}"><label><input type="checkbox"> <span>${esc(pt.d)}</span></label><div class="ponto-img"></div></div>`).join('')}
      <p class="pequeno" id="pontos-prog"></p></details>` : ''}
      ${revisar || lido ? '<h2>Prévia</h2><div class="cartao"><div class="cifra" id="previa-viva"></div></div>' : ''}
    </form>
    ${original ? `<div class="revisao-original"><div class="pequeno suave">${m.daPartitura ? 'Partitura original' : 'Original escaneado'}</div><div id="orig"></div></div>` : ''}
    ${lido ? `<div class="revisao-original"><div class="pequeno suave">Original lido</div>${lido.map((u, i) => `<img class="pagina-escaneada" src="${u}" alt="Página ${i + 1} do original">`).join('')}</div>` : ''}
    </div>`;
  if (revisar || lido) {
    document.body.classList.remove('com-painel');
    document.body.classList.add('larga');
    const pv = tela.querySelector('#previa-viva');
    const desenhaPrevia = () => { pv.innerHTML = renderizarHTML(tela.querySelector('[name=chordpro]').value); };
    tela.querySelector('[name=chordpro]').addEventListener('input', desenhaPrevia);
    desenhaPrevia();
    if (pontos.length) {
      const prog = tela.querySelector('#pontos-prog');
      const contar = () => { const n = tela.querySelectorAll('.ponto input:checked').length; prog.textContent = `${n} de ${pontos.length} conferidos`; };
      tela.querySelectorAll('.ponto input').forEach(c => c.addEventListener('change', e => { e.target.closest('.ponto').classList.toggle('ok', e.target.checked); contar(); }));
      contar();
      import('./visualizar-pdf.js').then(async ({ recorte }) => {
        for (const el of tela.querySelectorAll('.ponto')) {
          try { el.querySelector('.ponto-img').append(await recorte(fonte, pontos[+el.dataset.i])); }
          catch { el.querySelector('.ponto-img').textContent = '(não foi possível mostrar o trecho)'; }
        }
      });
    }
    if (original) requestAnimationFrame(() => desenharPDF(original, tela.querySelector('#orig')));
  }
  const f = tela.querySelector('#f');
  const ler = () => ({
    nome: f.nome.value.trim(), complemento: f.complemento.value.trim(), chordpro: f.chordpro.value.replace(/\s+$/, ''),
    tempos: [...f.querySelectorAll('[name=tempos]:checked')].map(i => +i.value),
    partes: [...f.querySelectorAll('[name=partes]:checked')].map(i => +i.value),
    cabecalho: d.cabecalho, youtube: d.youtube, youtubeInicio: d.youtubeInicio,
    audio: d.audio, audios: d.audios, audioQuebrado: d.audioQuebrado,
    ocr: derivada || !d.ocr ? null : { ...d.ocr, revisar: false, revisada: new Date().toISOString() }, // salvar depois de conferir = revisada
  });
  const lerFoto = tela.querySelector('#ler-foto');
  if (lerFoto) lerFoto.onchange = async e => {
    const arquivos = [...e.target.files];
    if (!arquivos.length) return;
    const atual = ler();
    const msg = document.createElement('p');
    msg.className = 'pequeno'; f.querySelector('.barra').after(msg);
    const { lerEInserir } = await import('./importar.js');
    lerEInserir(arquivos, msg, { nome: atual.nome, complemento: atual.complemento, tempos: atual.tempos, partes: atual.partes });
  };
  tela.querySelector('#converter').onclick = () => {
    const t = f.chordpro.value;
    if (t.includes('[') && !t.split('\n').some(ehLinhaDeAcordes)) { aviso('A cifra já está em ChordPro'); return; }
    f.chordpro.value = textoParaChordPro(t);
    aviso('Convertido');
  };
  tela.querySelector('#previa').onclick = () => {
    const prev = { ...ler(), tom: '' };
    const { el } = modal(`<div class="barra" style="justify-content:space-between"><b>${esc(prev.nome || 'Prévia')}</b><button class="btn peq" data-fechar>Fechar</button></div><div id="p"></div>`);
    import('./cifra.js').then(({ detectarTom }) => { prev.tom = detectarTom(prev.chordpro); el.querySelector('#p').append(painelCifra(prev, { compacto: true })); });
  };
  f.onsubmit = async e => {
    e.preventDefault();
    const dados = ler();
    if (!dados.nome) { aviso('Informe o título'); return; }
    if (revisar) {
      const r = await salvarCorrecao(chave, dados);
      if (!r.ok) { aviso('Não foi possível salvar a correção'); return; }
      aviso(r.onde === 'projeto' ? 'Correção gravada no acervo do projeto' : 'Correção salva neste aparelho (servidor desligado)', 3500);
      irPara(opts.voltar || '#/musica/' + chave);
      return;
    }
    let destino = chave;
    if (derivada) {
      // nada mudou em relação ao original (no mesmo tom): não cria uma versão repetida
      const limpa = t => (t || '').replace(/\s+$/gm, '').trim();
      const igual = limpa(dados.chordpro) === limpa(m.chordpro) && dados.nome === m.nome
        && (!opts.tomAtual || opts.tomAtual === m.tom);
      if (igual) { aviso('Nada foi alterado: a versão personalizada não foi criada'); irPara(opts.voltar || '#/musica/' + chave); return; }
      destino = criarPersonalizada(chave, dados);
    }
    else if (m) destino = editarMusica(chave, dados) ? chave : null;
    else destino = salvarMinha(dados);
    if (!destino) { aviso('Não foi possível salvar (armazenamento cheio?)'); return; }
    aviso(derivada ? 'Versão personalizada salva' : 'Música salva');
    if (opts.aposSalvar) opts.aposSalvar(destino); else irPara('#/musica/' + destino);
  };
  tela.querySelector('#cancelar').onclick = () => irPara(opts.voltar || (m ? '#/musica/' + chave : '#/importar'));
  tela.querySelector('#excluir')?.addEventListener('click', async () => {
    if (!(await confirmar(`Excluir “${d.nome}”? Ela também sai das missas onde estiver.`, 'Excluir'))) return;
    excluirMinha(chave); aviso('Música excluída'); location.hash = '#/musicas';
  });
}

// ---------- Tela: ajustes ----------
function telaAjustes() {
  const p = estado.prefs;
  tela.innerHTML = `
    <h1>Ajustes</h1>
    <div class="cartao">
      <label class="campo"><span>Tema</span><select id="tema">
        <option value="ceu" ${p.tema === 'ceu' ? 'selected' : ''}>Céu (azul celeste)</option>
        <option value="auto" ${p.tema === 'auto' ? 'selected' : ''}>Automático (igual ao sistema)</option>
        <option value="claro" ${p.tema === 'claro' ? 'selected' : ''}>Claro</option>
        <option value="escuro" ${p.tema === 'escuro' ? 'selected' : ''}>Escuro</option></select></label>
      <label class="campo"><span>Tamanho da letra da cifra: <b id="vf">${p.fonte}px</b></span><input type="range" id="fonte" min="11" max="40" value="${p.fonte}" style="width:100%"></label>
      <label><input type="checkbox" id="mostrar" ${p.mostrarAcordes ? 'checked' : ''}> Mostrar acordes</label><br>
      <label><input type="checkbox" id="mono" ${p.mono ? 'checked' : ''}> Fonte monoespaçada (como no PDF)</label>
    </div>
    <div id="conta">${cartaoConta()}${cartaoMinisterio()}</div>
    <div class="cartao">
      <h2 style="margin-top:0">Capas da missa</h2>
      <label class="campo"><span>Nome da paróquia ou comunidade (aparece embaixo, na capa)</span><input type="text" id="paroquia" value="${esc(p.paroquia || '')}" placeholder="Ex.: Paróquia Santa Rita"></label>
    </div>
    <div class="cartao">
      <h2 style="margin-top:0">Servidor de reconhecimento</h2>
      <p class="pequeno suave">Usado para cifrar a partir do YouTube e transcrever a letra. Rode <code>node server/servidor.mjs</code> no computador.</p>
      <label class="campo"><span>Endereço</span><input type="url" id="servidor" value="${esc(p.servidor)}"></label>
      <button class="btn" id="testar">Testar conexão</button> <span id="res-servidor" class="pequeno"></span>
    </div>
    <div class="cartao">
      <h2 style="margin-top:0">Backup</h2>
      <p class="pequeno suave">Suas missas, músicas próprias, edições e tons ficam salvos só neste aparelho. Use o backup para levar para outro aparelho.</p>
      <div class="barra"><button class="btn" id="exportar">Salvar backup</button>
        <label class="btn">Restaurar backup<input type="file" id="restaurar" accept=".json,application/json" hidden></label></div>
    </div>
    <div class="cartao pequeno suave">
      Acervo: ${estado.base?.length || 0} músicas da ${esc(estado.fonte || 'arquidiocese')}${estado.atualizado ? `, importadas em ${new Date(estado.atualizado).toLocaleDateString('pt-BR')}` : ''}.
      ${estado.minhas.length} músicas próprias · ${estado.missas.length} missas.
    </div>`;
  const $ = s => tela.querySelector(s);
  $('#tema').onchange = e => { p.tema = e.target.value; salvarPrefs(); aplicarPrefs(); };
  $('#fonte').oninput = e => { p.fonte = +e.target.value; $('#vf').textContent = p.fonte + 'px'; salvarPrefs(); aplicarPrefs(); };
  $('#mostrar').onchange = e => { p.mostrarAcordes = e.target.checked; salvarPrefs(); };
  $('#mono').onchange = e => { p.mono = e.target.checked; salvarPrefs(); };
  const caixaConta = $('#conta');
  caixaConta.addEventListener('click', e => { const b = e.target.closest('[data-conta]'); if (b) acaoConta(b, caixaConta, () => { caixaConta.innerHTML = cartaoConta() + cartaoMinisterio(); }); });
  $('#paroquia').onchange = e => { p.paroquia = e.target.value.trim(); salvarPrefs(); };
  $('#servidor').onchange = e => { p.servidor = e.target.value.replace(/\/$/, ''); salvarPrefs(); };
  $('#testar').onclick = async () => {
    const r = $('#res-servidor'); r.textContent = 'Testando...';
    try {
      const s = await (await fetch(p.servidor + '/api/status')).json();
      r.textContent = `Conectado. YouTube: ${s.ytdlp ? 'sim' : 'falta yt-dlp'} · Letra: ${s.whisper ? 'sim' : 'falta Whisper'} · ffmpeg: ${s.ffmpeg ? 'sim' : 'não'}`;
    } catch { r.textContent = 'Sem conexão com o servidor.'; }
  };
  $('#exportar').onclick = () => baixarArquivo(`cifras-liturgicas-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportarBackup(), null, 1));
  $('#restaurar').onchange = async e => {
    const arq = e.target.files[0]; if (!arq) return;
    try { await importarBackup(JSON.parse(await arq.text())); aviso('Backup restaurado'); telaAjustes(); }
    catch (err) { aviso(err.message || 'Arquivo inválido'); }
  };
}

// ---------- Rotas ----------
const ROTAS = [
  [/^#\/musicas$/, () => telaMusicas(), 'musicas'],
  [/^#\/musica\/(.+)$/, c => telaMusica(decodeURIComponent(c)), 'musicas'],
  [/^#\/editar\/(.+)$/, c => telaEditar(decodeURIComponent(c)), 'musicas'],
  [/^#\/revisar\/(.+)$/, c => telaEditar(decodeURIComponent(c), {}, { revisar: true, voltar: '#/musica/' + c }), 'musicas'],
  [/^#\/nova$/, () => telaEditar(null), 'importar'],
  [/^#\/missas$/, () => telaMissas(tela), 'missas'],
  [/^#\/missa\/(.+)$/, id => telaMissa(tela, id), 'missas'],
  [/^#\/tocar\/([^/]+)\/?(\d*)$/, (id, n) => telaTocar(tela, id, n), 'missas'],
  [/^#\/importar$/, () => telaImportar(tela), 'importar'],
  [/^#\/ouvir$/, () => telaOuvir(tela), 'ouvir'],
  [/^#\/afinador$/, () => telaAfinador(tela), 'afinador'],
  [/^#\/sumario$/, () => telaSumario(tela), 'sumario'],
  [/^#\/ajustes$/, () => telaAjustes(), 'ajustes'],
];

let rotaAnterior = '';
function rotear() {
  const h = location.hash || '#/musicas';
  cancelAnimationFrame(rolando);
  if (!h.startsWith('#/tocar/')) sairTocar();
  if (rotaAnterior.startsWith('#/ouvir') && !h.startsWith('#/ouvir')) pararOuvir();
  if (rotaAnterior.startsWith('#/afinador') && !h.startsWith('#/afinador')) pararAfinador();
  for (const [re, fn, aba] of ROTAS) {
    const m = h.match(re);
    if (!m) continue;
    document.querySelectorAll('.abas a').forEach(a => a.classList.toggle('ativa', a.dataset.aba === aba));
    document.body.classList.toggle('com-painel', /^#\/(musicas|musica\/|editar\/|nova)/.test(h));
    document.body.classList.remove('larga');
    abrirPainel(false);
    tituloNoTopo(null);
    document.querySelectorAll('details.menu-mais[open]').forEach(d => { d.open = false; });
    const mesmaLista = h === '#/musicas' && rotaAnterior.startsWith('#/musica/');
    fn(...m.slice(1));
    if (!mesmaLista) window.scrollTo(0, 0);
    rotaAnterior = h;
    return;
  }
  location.hash = '#/musicas';
}

// Mantém a posição da lista ao voltar de uma música
const posicoes = {};
window.addEventListener('hashchange', () => { posicoes[rotaAnterior] = window.scrollY; rotear(); if (posicoes[location.hash]) window.scrollTo(0, posicoes[location.hash]); });

window.addEventListener('missa-mudou', () => {
  if ((location.hash || '#/musicas') === '#/musicas' && filtro.autoDe !== marcaMissa(missaAtiva())) { const y = window.scrollY; telaMusicas(); window.scrollTo(0, y); }
});
window.addEventListener('foco-mudou', () => {
  if ((location.hash || '#/musicas') === '#/musicas') { telaMusicas(); window.scrollTo(0, 0); }
});

// lupa do topo: vai para Músicas e põe o cursor na busca
document.getElementById('topo-busca').onclick = () => {
  const focar = () => { const b = document.getElementById('busca'); if (b) { b.focus(); b.scrollIntoView({ block: 'center' }); } };
  if ((location.hash || '#/musicas') === '#/musicas') return focar();
  window.addEventListener('hashchange', () => requestAnimationFrame(focar), { once: true });
  location.hash = '#/musicas';
};
document.addEventListener('click', e => {
  document.querySelectorAll('details.menu-mais[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('details.menu-mais[open]').forEach(d => { d.open = false; d.querySelector('summary').focus(); });
});

function rede() { document.getElementById('status-rede').hidden = navigator.onLine; }
window.addEventListener('online', rede);
window.addEventListener('offline', rede);

aplicarPrefs();
rede();
tela.innerHTML = '<p class="vazio">Carregando acervo...</p>';
await carregarAcervo();
iniciarPainel();
rotear();
// conta e grupo (Firebase): quando chegam as missas/cifras do grupo, redesenha as telas que mostram isso
iniciarNuvem();
window.addEventListener('nuvem-mudou', () => {
  const h = location.hash || '';
  if (/^#\/(ajustes|missas)$/.test(h) || (h.startsWith('#/missa/') && !document.querySelector('.modal-fundo'))) { const y = window.scrollY; rotear(); window.scrollTo(0, y); }
});
// missa do dia/fim de semana montada sozinha pela data (ao abrir e ao voltar para o app num outro dia)
const automatica = () => missaAutomatica().then(m => {
  if (!m) return;
  window.dispatchEvent(new Event('missa-mudou'));
  if (location.hash === '#/missas') telaMissas(tela);
}).catch(() => {});
automatica();
let diaVisto = new Date().toDateString();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && new Date().toDateString() !== diaVisto) { diaVisto = new Date().toDateString(); automatica(); }
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
