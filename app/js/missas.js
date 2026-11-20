// Montagem de missas: roteiro de cantos por parte da missa, troca de cantos e de tom
import { estado, musica, buscar, versoes, rotuloVersao, salvarMissas, salvarPrefs, carregarRepertorios } from './dados.js';
import { esc, aviso, modal, confirmar, irPara, ORDEM_TEMPOS, COR_TEMPO, nomeTempo, nomeParte, listaAlfabetica, itemMusica } from './ui.js';
import { painelCifra, telaEditar } from './app.js';
import { chordproNoTom } from './cifra.js';
import { exportarMissa } from './exportar.js';
import { listarFolhetos, folhetoDaData, pdfDoFolheto, sincronizarFolhetos, removerFolheto, folhetosCompartilhados } from './folheto.js';
import { desenharPDF } from './visualizar-pdf.js';

// Roteiro padrão: rótulo exibido e parte da missa usada para sugerir cantos
const ROTEIRO = [
  ['Entrada', 4], ['Ato penitencial', 5], ['Glória', 1], ['Salmo responsorial', 6], ['Aclamação ao Evangelho', 3],
  ['Apresentação das oferendas', 10], ['Santo', 2],
  ['Prece eucarística: aclamação memorial', 20], ['Prece eucarística: doxologia e Amém', 20], ['Cordeiro de Deus', 15], ['Comunhão', 16],
  ['Ação de graças', 18], ['Canto a Maria', 90], ['Final', 18],
];

const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const achar = id => estado.missas.find(x => x.id === id);
export const salvarMissa = () => {
  if (!salvarMissas()) aviso('Não foi possível salvar (armazenamento cheio?)');
  window.dispatchEvent(new Event('missa-mudou'));
};
const salvar = salvarMissa;

// ---------- Missa ativa (a que aparece no painel à esquerda) e foco numa parte ----------
export const missaAtiva = () => estado.missas.find(x => x.id === estado.prefs.missaAtiva) || null;
export const foco = { idx: null };

export function definirAtiva(id) {
  estado.prefs.missaAtiva = id || null;
  salvarPrefs();
  foco.idx = null;
  window.dispatchEvent(new Event('missa-mudou'));
}

export function definirFoco(i) {
  foco.idx = i;
  window.dispatchEvent(new Event('foco-mudou'));
}

const proximoVazio = (x, depoisDe) => {
  const i = x.itens.findIndex((it, n) => n > depoisDe && !it.chave);
  return i < 0 ? null : i;
};

// Coloca um canto na missa: na parte em foco; senão na 1ª parte vazia que combina; senão cria uma parte nova
export function adicionarNaMissa(x, chave, tom) {
  const m = musica(chave);
  const t = tom && tom !== m.tom ? tom : (estado.tons[chave] && estado.tons[chave] !== m.tom ? estado.tons[chave] : null);
  const partes = m.partes || [];
  let idx = -1;
  if (foco.idx != null && x.itens[foco.idx]) {
    const f = x.itens[foco.idx];
    if (!f.chave) idx = foco.idx;
    else { x.itens.splice(foco.idx + 1, 0, { rotulo: f.rotulo, parte: f.parte, chave: null, tom: null }); idx = foco.idx + 1; }
    foco.idx = proximoVazio(x, idx);
  } else {
    idx = x.itens.findIndex(it => !it.chave && partes.includes(it.parte));
    if (idx < 0 && !partes.length) idx = x.itens.findIndex(it => !it.chave);
    if (idx < 0 && partes.length) {
      // todas as partes que combinam já têm canto: acrescenta outro logo depois da última delas
      let ult = -1; x.itens.forEach((it, n) => { if (partes.includes(it.parte)) ult = n; });
      const rotulo = ult >= 0 ? x.itens[ult].rotulo : nomeParte(partes[0]).split(' / ')[0];
      x.itens.splice(ult + 1 || x.itens.length, 0, { rotulo, parte: ult >= 0 ? x.itens[ult].parte : partes[0], chave: null, tom: null });
      idx = ult >= 0 ? ult + 1 : x.itens.length - 1;
    }
    if (idx < 0) { x.itens.push({ rotulo: 'Canto', parte: null, chave: null, tom: null }); idx = x.itens.length - 1; }
  }
  x.itens[idx].chave = chave;
  x.itens[idx].tom = t;
  salvarMissa();
  return x.itens[idx];
}

export function adicionarComAviso(x, m, tom) {
  const it = adicionarNaMissa(x, m.chave, tom);
  aviso(`“${m.nome}” entrou em ${it.rotulo}`);
  return it;
}

export function removerCanto(x, i) {
  const it = x.itens[i]; if (!it) return;
  it.chave = null; it.tom = null;
  salvarMissa();
}

// Abre o editor com a cifra no tom que está na missa; ao salvar, o canto da missa passa a ser a versão personalizada
export function personalizarItem(x, i, voltar = '#/missa/' + x.id) {
  const it = x.itens[i], m = it && musica(it.chave);
  if (!m) return;
  const tom = it.tom || estado.tons[m.chave] || m.tom;
  document.body.classList.remove('modo-tocar');
  window.scrollTo(0, 0);
  telaEditar(m.chave, { chordpro: chordproNoTom(m.chordpro, m.tom, tom) }, {
    voltar, tomAtual: tom,
    aposSalvar: nova => { it.chave = nova; it.tom = null; salvarMissa(); irPara(voltar); },
  });
}

// Tempo litúrgico aproximado pela data (para já sugerir o filtro certo)
function tempoPorData(d) {
  const ano = d.getFullYear();
  const pascoa = (() => { // algoritmo de Meeus
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, dd = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
  })();
  const dias = n => new Date(pascoa.getTime() + n * 864e5);
  const natal = new Date(ano, 11, 25);
  const advento = new Date(natal); advento.setDate(25 - ((natal.getDay() || 7)) - 21);
  if (d >= advento && d < natal) return 1;
  if (d >= natal || d < new Date(ano, 0, 13)) return 4;
  if (d >= dias(-46) && d < dias(-7)) return 2;
  if (d >= dias(-7) && d <= dias(0)) return 6;
  if (d > dias(0) && d <= dias(49)) return 3;
  return 5;
}
// Ano litúrgico A/B/C: começa no 1º domingo do Advento (ano que termina em N: N%3 = 1 → A, 2 → B, 0 → C)
function anoPorData(d) {
  let n = d.getFullYear();
  const natal = new Date(n, 11, 25);
  const advento = new Date(n, 11, 25 - (natal.getDay() || 7) - 21);
  if (d >= advento) n += 1;
  return [3, 1, 2][n % 3];
}

// ---------- Repertório proposto pela Arquidiocese ----------
// repertório do fim de semana de uma data: o de mesma data; senão o mais próximo entre 1 dia antes e 6 depois
// (sábado à noite → domingo; dia de semana → domingo seguinte)
export function repertorioDaData(reps, isoData) {
  if (!isoData) return null;
  const d = new Date(isoData + 'T12:00').getTime();
  let melhor = null, dist = Infinity;
  for (const r of reps) {
    if (!r.data) continue;
    const dias = Math.round((new Date(r.data + 'T12:00').getTime() - d) / 864e5);
    if (dias < -1 || dias > 6) continue;
    const peso = dias === 0 ? -1 : Math.abs(dias);
    if (peso < dist) { dist = peso; melhor = r; }
  }
  return melhor;
}

const NOTAS_PT = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };
// "Lá maior", "Mi menor", "Fá# maior", "Si bemol maior" → tom no formato do app (A, Em, F#, Bb)
function tomDoTexto(t) {
  const m = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .match(/\b(do|re|mi|fa|sol|la|si)\s*(#|b\b|sustenido|bemol)?\s*(maior|menor)\b/);
  if (!m) return null;
  return NOTAS_PT[m[1]] + (m[2] ? (m[2] === '#' || m[2] === 'sustenido' ? '#' : 'b') : '') + (m[3] === 'menor' ? 'm' : '');
}

// parte da missa de cada canto do repertório: pelo texto do site (Entrada, Oferendas…) e, se não disser, pela classificação do canto
const CANTO_MARIANO = /\b(maria|nossa senhora|virgem|ave|magnificat|salve,? rainha|mae de deus|imaculada|aparecida)\b/;
const ROTULO_PARTE = { 4: 'Entrada', 5: 'Ato penitencial', 1: 'Glória', 6: 'Salmo responsorial', 3: 'Aclamação ao Evangelho',
  10: 'Apresentação das oferendas', 2: 'Santo', 20: 'Prece eucarística', 15: 'Cordeiro de Deus', 16: 'Comunhão', 90: 'Canto a Maria', 18: 'Outro canto', 19: 'Presidência e assembleia' };
function parteDoCanto(texto, m) {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/aclamacao memorial|memorial|todas as vezes|anunciamos/.test(t)) return ['Prece eucarística: aclamação memorial', 20];
  if (/doxologia/.test(t)) return ['Prece eucarística: doxologia e Amém', 20];
  if (/\bentrada\b/.test(t)) return ['Entrada', 4];
  if (/oferend|ofertorio/.test(t)) return ['Apresentação das oferendas', 10];
  if (/comunhao/.test(t)) return ['Comunhão', 16];
  if (/acao de gracas/.test(t)) return ['Ação de graças', 18];
  if (CANTO_MARIANO.test(t) || m?.partes?.includes(90) && !/\b(final|envio)\b/.test(t)) return ['Canto a Maria', 90];
  if (/\b(final|envio)\b/.test(t)) return ['Final', 18];
  const p = m?.partes?.find(x => ROTULO_PARTE[x]);
  if (p) return [ROTULO_PARTE[p], p];
  if (/salmo/.test(t)) return ['Salmo responsorial', 6];
  if (/aleluia|aclamacao/.test(t)) return ['Aclamação ao Evangelho', 3];
  if (/cordeiro/.test(t)) return ['Cordeiro de Deus', 15];
  if (/\bsanto\b/.test(t)) return ['Santo', 2];
  if (/gloria/.test(t)) return ['Glória', 1];
  if (/senhor,? (que|tende)|kyrie|piedade/.test(t)) return ['Ato penitencial', 5];
  return ['Canto', null];
}

// itens da missa na ordem do repertório; a mesma parte repetida (opções ou mais de um canto) vira "Comunhão (2)"
export function itensDoRepertorio(rep) {
  const itens = [], cont = {};
  let fora = 0;
  for (const c of rep.musicas) {
    const m = c.id ? musica('a' + c.id) : null;
    if (!m) { fora++; continue; }
    const [rotulo, parte] = parteDoCanto(c.texto, m);
    cont[rotulo] = (cont[rotulo] || 0) + 1;
    const tom = tomDoTexto(c.texto);
    itens.push({ rotulo: cont[rotulo] > 1 ? `${rotulo} (${cont[rotulo]})` : rotulo, parte, chave: m.chave, tom: tom && tom !== m.tom ? tom : null });
  }
  return { itens, fora };
}

// ---------- Folheto "O Dia do Senhor" (guardado no aparelho) ----------
// canto do folheto pelo número (o mesmo das cifras da Arquidiocese)
const musicaDoNumero = num => estado.musicas.find(m => m.origem === 'arquipoa' && +m.numero === num && m.id < 100000)
  || estado.musicas.find(m => m.origem === 'arquipoa' && +m.numero === num) || null;
const parteDoFolheto = (c, m) => c.parte ?? m?.partes?.find(p => ROTULO_PARTE[p]) ?? null;
const baseRotulo = it => (it.rotulo || '').replace(/\s*\(\d+\)$/, '');
// cantos do folheto que estão (ou não) na missa
export function cantosDoFolhetoNaMissa(x, fol) {
  return fol.cantos.map(c => {
    const m = musicaDoNumero(c.num);
    const i = m ? x.itens.findIndex(it => it.chave && musica(it.chave)?.grupo === m.grupo) : -1;
    return { ...c, m, parte: parteDoFolheto(c, m), naMissa: i >= 0 };
  });
}
export const numerosDoFolheto = fol => new Set(fol.cantos.map(c => c.num));
export const ehDoFolheto = (m, nums) => !!m && versoes(m).some(v => v.origem === 'arquipoa' && nums.has(+v.numero));
// Põe os cantos do folheto na missa: o que já está vira a 1ª opção da sua parte; o que falta entra na parte vazia
// ou numa linha nova depois da mesma parte. Devolve quantos entraram.
export function aplicarFolheto(itens, fol) {
  const marcados = new Set();
  let novos = 0;
  for (const c of fol.cantos) {
    const m = musicaDoNumero(c.num);
    if (!m) continue;
    const parte = parteDoFolheto(c, m);
    const i = itens.findIndex(it => it.chave && musica(it.chave)?.grupo === m.grupo);
    if (i >= 0) {
      const base = baseRotulo(itens[i]);
      const j = itens.findIndex(it => baseRotulo(it) === base && !marcados.has(it));
      if (j >= 0 && j < i) {
        const a = itens[i], b = itens[j];
        [a.chave, b.chave] = [b.chave, a.chave]; [a.tom, b.tom] = [b.tom, a.tom];
        marcados.add(b);
      } else marcados.add(itens[i]);
      continue;
    }
    const vazio = itens.find(it => !it.chave && it.parte === parte);
    if (vazio) { vazio.chave = m.chave; vazio.tom = null; marcados.add(vazio); novos++; continue; }
    const rot = ROTULO_PARTE[parte] || 'Canto';
    const k = itens.map(it => it.parte).lastIndexOf(parte);
    const fim = itens.findIndex(it => /^final/i.test(baseRotulo(it)));
    const n = itens.filter(it => baseRotulo(it) === rot).length;
    const novo = { rotulo: n ? `${rot} (${n + 1})` : rot, parte, chave: m.chave, tom: null };
    itens.splice(k >= 0 ? k + 1 : fim >= 0 ? fim : itens.length, 0, novo);
    marcados.add(novo); novos++;
  }
  return novos;
}
const dataCurta = d => new Date(d + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Botão "Folheto" (abre dentro do app, como o vídeo) e cantos do folheto; alvo = elemento onde desenhar
function cartaoFolheto(fol, x) {
  const cantos = x ? cantosDoFolhetoNaMissa(x, fol) : fol.cantos.map(c => { const m = musicaDoNumero(c.num); return { ...c, m, parte: parteDoFolheto(c, m) }; });
  const faltam = x ? cantos.filter(c => c.m && !c.naMissa).length : 0;
  return `<div class="cartao folheto-cartao" data-folheto="${esc(fol.data)}">
    <div class="barra" style="margin:0;justify-content:space-between;align-items:center">
      <div><b>📄 Folheto O Dia do Senhor</b> · ${esc(fol.titulo)} <span class="pequeno suave">(${esc(dataCurta(fol.data))})</span></div>
      <div class="barra" style="margin:0">
        <button class="btn peq primario" data-folheto-acao="ver">Folheto ▾</button>
        ${faltam ? `<button class="btn peq" data-folheto-acao="por">Pôr na missa os ${faltam} que faltam</button>` : ''}
        ${x ? '' : `<button class="btn peq" data-folheto-acao="missa">Montar a missa</button><button class="btn peq perigo" data-folheto-acao="remover" title="Tirar do aparelho">✕</button>`}
      </div></div>
    <div class="pequeno" style="margin-top:.4em">${cantos.length ? cantos.map(c => `<span class="folheto-canto${x && !c.naMissa ? ' falta' : ''}">nº ${c.num}${c.m ? ` ${c.m.chave ? `<a href="#/musica/${esc(c.m.chave)}">${esc(c.m.nome)}</a>` : ''}` : ' (não está no acervo)'}${c.parte && ROTULO_PARTE[c.parte] ? ` <span class="suave">· ${esc(ROTULO_PARTE[c.parte])}</span>` : ''}${x ? (c.naMissa ? ' ✓' : c.m ? ' <span class="suave">(fora da missa)</span>' : '') : ''}</span>`).join('') : '<span class="suave">Não achei cantos indicados neste folheto.</span>'}</div>
    <div class="folheto-paginas" hidden></div>
  </div>`;
}
function ligarFolheto(raiz, fol, { aoPor, aoRemover } = {}) {
  const c = raiz.querySelector(`[data-folheto="${CSS.escape(fol.data)}"]`);
  if (!c) return;
  const pags = c.querySelector('.folheto-paginas');
  c.addEventListener('click', async e => {
    const b = e.target.closest('[data-folheto-acao]'); if (!b) return;
    const acao = b.dataset.folhetoAcao;
    if (acao === 'ver') {
      pags.hidden = !pags.hidden;
      b.textContent = pags.hidden ? 'Folheto ▾' : 'Fechar folheto ▴';
      if (!pags.hidden && !pags.dataset.ok) {
        pags.dataset.ok = '1';
        const pdf = await pdfDoFolheto(fol.data);
        if (pdf) desenharPDF(pdf, pags, 'o folheto'); else pags.innerHTML = '<p class="vazio">O PDF deste folheto não está mais no aparelho. Sincronize de novo.</p>';
      }
    }
    if (acao === 'por') aoPor?.();
    if (acao === 'missa') {
      const ja = estado.missas.find(y => folhetoDaData([fol], y.data));
      if (ja) location.hash = '#/missa/' + ja.id; else novaMissa(null, { data: fol.data });
    }
    if (acao === 'remover' && await confirmar(`Tirar do aparelho o folheto “${fol.titulo}” (${dataCurta(fol.data)})?`, 'Tirar')) { await removerFolheto(fol.data); aoRemover?.(); }
  });
}

// ---------- Lista de missas ----------
export function telaMissas(tela) {
  const missas = estado.missas.slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  tela.innerHTML = `
    <div class="barra" style="justify-content:space-between"><h1 style="margin:0">Missas</h1>
      <button class="btn primario" id="nova">✚ Nova missa</button></div>
    ${missas.length ? missas.map(x => `<a class="item" href="#/missa/${x.id}">
      <span class="info"><span class="nome">${esc(x.titulo)}</span>
        <div class="comp">${x.data ? new Date(x.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : ''} · ${x.itens.filter(i => i.chave).length} cantos</div>
        <div class="selos">${x.tempo ? `<span class="selo tempo" style="--cor:${COR_TEMPO[x.tempo]}">${esc(nomeTempo(x.tempo))}</span>` : ''}${x.ano ? `<span class="selo">${esc(estado.taxonomia.anos[x.ano] || '')}</span>` : ''}</div>
      </span></a>`).join('') : '<p class="vazio">Nenhuma missa ainda. Crie uma e escolha os cantos de cada parte.</p>'}
    <h2 style="margin-top:1.4em">Folhetos “O Dia do Senhor”</h2>
    <p class="pequeno suave">No celular: no WhatsApp, toque no PDF do folheto → Compartilhar → <b>Cifras Litúrgicas</b>. Ou toque em Sincronizar e escolha os PDFs. O app lê a data e os cantos e liga cada folheto à missa do fim de semana. O folheto fica só neste aparelho.</p>
    <div class="barra"><button class="btn primario" id="sinc">⟳ Sincronizar folhetos</button><input type="file" id="arq-folheto" accept="application/pdf,.pdf" multiple hidden></div>
    <p class="pequeno" id="sinc-status" aria-live="polite"></p>
    <div id="lista-folhetos"></div>`;
  tela.querySelector('#nova').onclick = () => novaMissa();
  const lista = tela.querySelector('#lista-folhetos'), status = tela.querySelector('#sinc-status'), arq = tela.querySelector('#arq-folheto');
  const mostrar = async () => {
    const fs = await listarFolhetos();
    lista.innerHTML = fs.length ? fs.map(f => cartaoFolheto(f)).join('') : '<p class="vazio">Nenhum folheto no aparelho.</p>';
    fs.forEach(f => ligarFolheto(lista, f, { aoRemover: mostrar }));
  };
  mostrar();
  tela.querySelector('#sinc').onclick = () => arq.click();
  const sincronizar = async arquivos => {
    if (!arquivos.length) return;
    const botao = tela.querySelector('#sinc'); botao.disabled = true;
    tela.querySelector('#sinc').scrollIntoView({ block: 'center' });
    try {
      const r = await sincronizarFolhetos(arquivos, msg => { status.textContent = msg; });
      status.innerHTML = [r.novos.length ? `✓ ${r.novos.length} folheto(s) lido(s): ${r.novos.map(f => `${esc(f.titulo)} (${esc(dataCurta(f.data))}, ${f.cantos.length} cantos)`).join('; ')}` : '',
        r.pulados.length ? `${r.pulados.length} já estava(m) no aparelho` : '', ...r.falhas.map(f => `<span style="color:var(--perigo, #b00020)">${esc(f)}</span>`)].filter(Boolean).join('<br>');
    } finally { botao.disabled = false; }
    mostrar();
  };
  arq.onchange = () => { const arquivos = [...arq.files]; arq.value = ''; sincronizar(arquivos); };
  // chegou pelo "Compartilhar" (WhatsApp → Cifras Litúrgicas): já lê
  folhetosCompartilhados().then(sincronizar);
}

export function novaMissa(aoCriar, { data: dataInicial } = {}) {
  const hoje = new Date();
  const domingo = new Date(hoje); domingo.setDate(hoje.getDate() + ((7 - hoje.getDay()) % 7));
  const iso = dataInicial || domingo.toISOString().slice(0, 10);
  const tx = estado.taxonomia;
  const { el, fechar } = modal(`<h2 style="margin-top:0">Nova missa</h2>
    <form id="nm">
      <label class="campo"><span>Nome</span><input type="text" name="titulo" required value="Missa de domingo"></label>
      <label class="campo"><span>Data</span><input type="date" name="data" value="${iso}"></label>
      <label class="campo"><span>Tempo litúrgico</span><select name="tempo">${ORDEM_TEMPOS.filter(t => tx.tempos[t]).map(t => `<option value="${t}">${esc(tx.tempos[t])}</option>`).join('')}</select></label>
      <label class="campo"><span>Ano litúrgico</span><select name="ano"><option value="">—</option>${Object.entries(tx.anos).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
      <label class="campo"><span>Repertório proposto pela Arquidiocese</span><select name="rep"><option value="">carregando…</option></select></label>
      <p class="pequeno suave" id="rep-info" style="margin-top:-.4em"></p>
      <label id="rot"><input type="checkbox" name="roteiro" checked> Já criar as partes da missa (Entrada, Glória, Salmo...)</label>
      <div class="barra" style="justify-content:flex-end"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primario">Criar</button></div>
    </form>`);
  const f = el.querySelector('#nm');
  const sugerir = () => {
    if (!f.data.value) return;
    const d = new Date(f.data.value + 'T12:00');
    f.tempo.value = tempoPorData(d);
    f.ano.value = anoPorData(d);
  };
  let reps = [], tituloMexido = false, folhetos = [];
  listarFolhetos().then(l => { folhetos = l; mostrarRep(); });
  const folhetoDoForm = () => folhetoDaData(folhetos, f.data.value);
  f.titulo.oninput = () => { tituloMexido = true; };
  const info = el.querySelector('#rep-info');
  const mostrarRep = () => {
    const r = reps.find(x => String(x.id) === f.rep.value);
    el.querySelector('#rot').hidden = !!r;
    const fol = folhetoDoForm();
    const txtFol = fol ? ` Folheto O Dia do Senhor (${fol.titulo}): os ${fol.cantos.length} cantos indicados vêm primeiro em cada parte.` : '';
    if (!r) { info.textContent = (reps.length ? 'Sem repertório: a missa começa vazia ou só com as partes.' : '') + txtFol; return; }
    const { itens, fora } = itensDoRepertorio(r);
    info.textContent = `${itens.length} cantos já entram na missa, na ordem proposta${fora ? ` (${fora} não estão no acervo)` : ''}. Depois é só trocar o que quiser.` + txtFol;
    if (!tituloMexido) f.titulo.value = r.nome;
  };
  const escolherPelaData = () => {
    if (!reps.length) return;
    const r = repertorioDaData(reps, f.data.value);
    f.rep.value = r ? String(r.id) : '';
    if (!r && !tituloMexido) f.titulo.value = 'Missa de domingo';
    mostrarRep();
  };
  f.data.onchange = () => { sugerir(); escolherPelaData(); }; sugerir();
  f.rep.onchange = mostrarRep;
  carregarRepertorios().then(lista => {
    reps = lista.filter(r => r.musicas?.length);
    const fmt = r => (r.data ? new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' · ' : '') + r.nome;
    const datados = reps.filter(r => r.data).sort((a, b) => b.data.localeCompare(a.data)), outros = reps.filter(r => !r.data);
    f.rep.innerHTML = `<option value="">— não usar —</option>`
      + (datados.length ? `<optgroup label="Por data">${datados.map(r => `<option value="${r.id}">${esc(fmt(r))}</option>`).join('')}</optgroup>` : '')
      + (outros.length ? `<optgroup label="Outros (sem data)">${outros.map(r => `<option value="${r.id}">${esc(r.nome)}</option>`).join('')}</optgroup>` : '');
    if (!reps.length) { f.rep.innerHTML = '<option value="">indisponível (sem internet?)</option>'; f.rep.disabled = true; }
    escolherPelaData();
  });
  f.onsubmit = e => {
    e.preventDefault();
    const rep = reps.find(x => String(x.id) === f.rep.value);
    const missa = { id: novoId(), titulo: f.titulo.value.trim() || 'Missa', data: f.data.value, tempo: +f.tempo.value || null,
      ano: +f.ano.value || null, repertorio: rep ? rep.id : undefined,
      itens: rep ? itensDoRepertorio(rep).itens : f.roteiro.checked ? ROTEIRO.map(([rotulo, parte]) => ({ rotulo, parte, chave: null, tom: null })) : [] };
    const fol = folhetoDoForm();
    if (fol) aplicarFolheto(missa.itens, fol);
    estado.missas.push(missa); estado.prefs.missaAtiva = missa.id; salvarPrefs(); foco.idx = null; salvar(); fechar();
    if (rep) aviso(`Missa montada com o repertório da Arquidiocese: ${rep.nome}`);
    if (aoCriar) aoCriar(missa); else if (rep) location.hash = '#/missa/' + missa.id; else if (location.hash === '#/musicas') window.dispatchEvent(new Event('missa-mudou')); else location.hash = '#/musicas';
  };
}

// ---------- Uma missa ----------
export function telaMissa(tela, id, modo) {
  const x = achar(id);
  if (!x) { tela.innerHTML = '<p class="vazio">Missa não encontrada.</p>'; return; }
  if (estado.prefs.missaAtiva !== id) definirAtiva(id);
  modo ||= sessionStorage.getItem('cl.modoMissa') === 'ler' ? 'ler' : 'montar';
  const redesenhar = (novoModo = modo) => { const y = window.scrollY; telaMissa(tela, id, novoModo); window.scrollTo(0, y); };
  const tx = estado.taxonomia;

  tela.innerHTML = `
    <div class="nao-imprimir"><a href="#/missas" class="pequeno">‹ Missas</a></div>
    <h1>${esc(x.titulo)}</h1>
    <div class="pequeno suave">${x.data ? new Date(x.data + 'T12:00').toLocaleDateString('pt-BR', { dateStyle: 'full' }) : ''}${x.tempo ? ' · ' + esc(nomeTempo(x.tempo)) : ''}${x.ano ? ' · ' + esc(tx.anos[x.ano] || '') : ''}</div>
    <div class="barra nao-imprimir">
      <button class="btn ${modo === 'montar' ? 'primario' : ''}" data-modo="montar">Montar</button>
      <button class="btn ${modo === 'ler' ? 'primario' : ''}" data-modo="ler">Ver cifras</button>
      <a class="btn primario" href="#/tocar/${x.id}/0" style="background:var(--acorde);border-color:var(--acorde)">▶ Tocar</a>
      <button class="btn primario" id="pdf">⬇ Exportar PDF</button>
      <button class="btn" id="imprimir">Imprimir</button>
      <button class="btn" id="compartilhar">Compartilhar lista</button>
      <button class="btn" id="dados">Editar dados</button>
      <button class="btn" id="duplicar">Duplicar</button>
      <button class="btn perigo" id="excluir">Excluir</button>
    </div>
    <div id="folheto" class="nao-imprimir"></div>
    <div id="corpo"></div>`;
  const corpo = tela.querySelector('#corpo');
  // folheto da data (guardado no aparelho): botão para ver dentro do app e selo nos cantos indicados nele
  listarFolhetos().then(fs => {
    const fol = folhetoDaData(fs, x.data);
    const alvo = tela.querySelector('#folheto');
    if (!fol || !alvo) return;
    alvo.innerHTML = cartaoFolheto(fol, x);
    ligarFolheto(alvo, fol, { aoPor: () => { const n = aplicarFolheto(x.itens, fol); salvar(); aviso(`${n} canto(s) do folheto na missa`); redesenhar(); } });
    const nums = numerosDoFolheto(fol);
    tela.querySelectorAll('.missa-slot[data-i]').forEach(s => {
      const it = x.itens[+s.dataset.i];
      if (ehDoFolheto(it?.chave && musica(it.chave), nums)) s.querySelector('.parte')?.insertAdjacentHTML('beforeend', ' <span class="selo folheto" title="Canto indicado no folheto O Dia do Senhor">folheto</span>');
    });
  });

  if (modo === 'montar') {
    corpo.innerHTML = x.itens.map((it, i) => {
      const m = it.chave && musica(it.chave);
      return `<div class="cartao missa-slot" data-i="${i}">
        <div class="info" style="flex:1;min-width:0">
          <div class="parte">${esc(it.rotulo || nomeParte(it.parte) || 'Canto')}</div>
          ${m ? `<a href="#/musica/${esc(m.chave)}" class="nome" style="font-weight:600">${esc(m.nome)}</a>${m.complemento ? `<div class="comp pequeno suave">${esc(m.complemento)}</div>` : ''}${m.totalVersoes > 1 ? `<div class="pequeno"><button class="link-versao" data-acao="versao">${esc(rotuloVersao(m).titulo)} de ${m.totalVersoes} ▾</button></div>` : ''}`
            : it.chave ? '<span class="suave">Música não encontrada</span>' : '<span class="suave">— escolher canto —</span>'}
        </div>
        ${m?.tom ? `<span class="tom" title="Tom">${esc(it.tom || m.tom)}</span>` : ''}
        <div class="acoes">
          <button class="btn peq primario" data-acao="trocar">${m ? 'Trocar' : 'Escolher'}</button>
          <button class="btn peq" data-acao="subir" title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn peq" data-acao="descer" title="Descer" ${i === x.itens.length - 1 ? 'disabled' : ''}>↓</button>
          ${m ? '<button class="btn peq" data-acao="pers" title="Personalizar a cifra ou a letra (fica como versão personalizada)">✎ Personalizar</button>' : ''}
          <button class="btn peq" data-acao="renomear" title="Renomear parte">Aa</button>
          <button class="btn peq perigo" data-acao="remover" title="Remover">✕</button>
        </div></div>`;
    }).join('') + `<button class="btn" id="add-parte">✚ Adicionar parte</button>`;

    corpo.addEventListener('click', async e => {
      const b = e.target.closest('[data-acao]'); if (!b) return;
      const i = +b.closest('[data-i]').dataset.i;
      const it = x.itens[i];
      if (b.dataset.acao === 'trocar') return escolherCanto(x, it, () => { salvar(); redesenhar(); });
      if (b.dataset.acao === 'versao') {
        const { el, fechar } = modal(`<div class="barra" style="justify-content:space-between;margin-top:0"><b>${esc(musica(it.chave).nome)}</b><button class="btn peq" data-fechar>Fechar</button></div><div id="v"></div>`);
        listaVersoes(el.querySelector('#v'), musica(it.chave), ch => { trocarChave(it, ch); fechar(); salvar(); redesenhar(); });
        return;
      }
      if (b.dataset.acao === 'pers') return personalizarItem(x, i);
      if (b.dataset.acao === 'subir') [x.itens[i - 1], x.itens[i]] = [x.itens[i], x.itens[i - 1]];
      if (b.dataset.acao === 'descer') [x.itens[i + 1], x.itens[i]] = [x.itens[i], x.itens[i + 1]];
      if (b.dataset.acao === 'renomear') {
        const novo = prompt('Nome da parte', it.rotulo || nomeParte(it.parte));
        if (novo === null) return;
        it.rotulo = novo.trim();
      }
      if (b.dataset.acao === 'remover') {
        if (it.chave && !(await confirmar(`Remover “${it.rotulo}” da missa?`, 'Remover'))) return;
        x.itens.splice(i, 1);
      }
      salvar(); redesenhar();
    });
    corpo.querySelector('#add-parte').onclick = () => {
      const { el, fechar } = modal(`<h2 style="margin-top:0">Adicionar parte</h2>
        <label class="campo"><span>Nome</span><input type="text" id="rot" value="Canto"></label>
        <label class="campo"><span>Sugerir cantos de</span><select id="par"><option value="">Qualquer parte</option>
        ${Object.entries(tx.partes).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        <div class="barra" style="justify-content:flex-end"><button class="btn" data-fechar>Cancelar</button><button class="btn primario" id="ok">Adicionar</button></div>`);
      el.querySelector('#par').onchange = e => { if (e.target.value) el.querySelector('#rot').value = tx.partes[e.target.value].split(' / ')[0]; };
      el.querySelector('#ok').onclick = () => {
        x.itens.push({ rotulo: el.querySelector('#rot').value.trim() || 'Canto', parte: +el.querySelector('#par').value || null, chave: null, tom: null });
        salvar(); fechar(); redesenhar();
      };
    };
  } else {
    // Modo leitura: todas as cifras em sequência, cada uma com seu tom
    corpo.innerHTML = '';
    corpo.classList.add('quebra-livre');
    const indice = document.createElement('div');
    indice.className = 'cartao nao-imprimir';
    indice.innerHTML = x.itens.filter(it => it.chave && musica(it.chave)).map((it, i) =>
      `<a href="#" data-ir="${i}" class="pequeno" style="display:inline-block;margin:2px 8px 2px 0">${esc(it.rotulo)}: ${esc(musica(it.chave).nome)}</a>`).join('') || 'Nenhum canto escolhido ainda.';
    corpo.append(indice);
    let n = 0;
    for (const it of x.itens) {
      const m = it.chave && musica(it.chave);
      if (!m) continue;
      const sec = document.createElement('section');
      sec.className = 'missa-cancao';
      sec.id = 'canto-' + n++;
      sec.innerHTML = `<div class="barra" style="justify-content:space-between;margin:0"><div class="parte pequeno suave" style="text-transform:uppercase;letter-spacing:.04em">${esc(it.rotulo)}</div>
        <button class="btn peq nao-imprimir" data-pers="${x.itens.indexOf(it)}">✎ Personalizar</button></div><h2>${esc(m.nome)}</h2>`;
      sec.querySelector('[data-pers]').onclick = e => personalizarItem(x, +e.currentTarget.dataset.pers);
      sec.append(painelCifra(m, { tomAlvo: it.tom || estado.tons[m.chave] || m.tom, compacto: true,
        aoMudarTom: t => { it.tom = t; salvar(); } }));
      corpo.append(sec);
    }
    indice.addEventListener('click', e => {
      const a = e.target.closest('[data-ir]'); if (!a) return;
      e.preventDefault();
      document.getElementById('canto-' + a.dataset.ir)?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  tela.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { sessionStorage.setItem('cl.modoMissa', b.dataset.modo); redesenhar(b.dataset.modo); window.scrollTo(0, 0); });
  tela.querySelector('#pdf').onclick = () => exportarMissa(x);
  tela.querySelector('#imprimir').onclick = () => {
    if (modo !== 'ler') { sessionStorage.setItem('cl.modoMissa', 'ler'); redesenhar('ler'); }
    setTimeout(() => window.print(), 300);
  };
  tela.querySelector('#compartilhar').onclick = async () => {
    const linhas = [`${x.titulo}${x.data ? ' — ' + new Date(x.data + 'T12:00').toLocaleDateString('pt-BR') : ''}`, ''];
    for (const it of x.itens) {
      const m = it.chave && musica(it.chave);
      if (m) linhas.push(`${it.rotulo}: ${m.nome}${(it.tom || m.tom) ? ` (${it.tom || m.tom})` : ''}`);
    }
    const texto = linhas.join('\n');
    try {
      if (navigator.share) await navigator.share({ title: x.titulo, text: texto });
      else { await navigator.clipboard.writeText(texto); aviso('Lista copiada'); }
    } catch { /* cancelado */ }
  };
  tela.querySelector('#dados').onclick = () => {
    const { el, fechar } = modal(`<h2 style="margin-top:0">Dados da missa</h2>
      <label class="campo"><span>Nome</span><input type="text" id="t" value="${esc(x.titulo)}"></label>
      <label class="campo"><span>Data</span><input type="date" id="d" value="${esc(x.data || '')}"></label>
      <label class="campo"><span>Tempo litúrgico</span><select id="tp"><option value="">—</option>${ORDEM_TEMPOS.filter(t => tx.tempos[t]).map(t => `<option value="${t}" ${x.tempo === t ? 'selected' : ''}>${esc(tx.tempos[t])}</option>`).join('')}</select></label>
      <label class="campo"><span>Ano litúrgico</span><select id="an"><option value="">—</option>${Object.entries(tx.anos).map(([k, v]) => `<option value="${k}" ${x.ano === +k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <div class="barra" style="justify-content:flex-end"><button class="btn" data-fechar>Cancelar</button><button class="btn primario" id="ok">Salvar</button></div>`);
    el.querySelector('#d').onchange = e => {
      if (!e.target.value) return;
      const dt = new Date(e.target.value + 'T12:00');
      el.querySelector('#tp').value = tempoPorData(dt); el.querySelector('#an').value = anoPorData(dt);
    };
    el.querySelector('#ok').onclick = () => {
      x.titulo = el.querySelector('#t').value.trim() || x.titulo; x.data = el.querySelector('#d').value;
      x.tempo = +el.querySelector('#tp').value || null; x.ano = +el.querySelector('#an').value || null;
      salvar(); fechar(); redesenhar();
    };
  };
  tela.querySelector('#duplicar').onclick = () => {
    const copia = { ...structuredClone(x), id: novoId(), titulo: x.titulo + ' (cópia)' };
    estado.missas.push(copia); salvar(); aviso('Missa duplicada'); location.hash = '#/missa/' + copia.id;
  };
  tela.querySelector('#excluir').onclick = async () => {
    if (!(await confirmar(`Excluir a missa “${x.titulo}”?`, 'Excluir'))) return;
    estado.missas = estado.missas.filter(y => y.id !== id); if (estado.prefs.missaAtiva === id) { estado.prefs.missaAtiva = null; salvarPrefs(); } salvar(); location.hash = '#/missas';
  };
}

// Escolher o canto de uma parte: já filtra pelo tempo da missa e pela parte, em ordem alfabética
function escolherCanto(x, it, aoEscolher) {
  const f = { termo: '', tempo: x.tempo, parte: it.parte };
  const tx = estado.taxonomia;
  const { el, fechar } = modal(`
    <div class="barra" style="justify-content:space-between;margin-top:0"><b>${esc(it.rotulo)}</b><button class="btn peq" data-fechar>Fechar</button></div>
    <input type="search" id="b" placeholder="Buscar título ou letra">
    <div class="filtros">
      <select id="t"><option value="">Todos os tempos</option>${ORDEM_TEMPOS.filter(t => tx.tempos[t]).map(t => `<option value="${t}" ${f.tempo === t ? 'selected' : ''}>${esc(tx.tempos[t])}</option>`).join('')}</select>
      <select id="p"><option value="">Todas as partes</option>${Object.entries(tx.partes).map(([k, v]) => `<option value="${k}" ${f.parte === +k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
    </div>
    ${it.chave ? '<button class="btn peq perigo" id="limpar" style="margin-top:8px">Deixar sem canto</button>' : ''}
    <p class="pequeno suave" id="n"></p><div id="r"></div>`);
  const desenhar = () => {
    const res = buscar({ termo: f.termo, tempo: f.tempo ?? null, parte: f.parte ?? null, agrupar: true });
    el.querySelector('#n').textContent = `${res.length} cantos`;
    const opcao = m => ({ href: '#', tom: estado.tons[m.chave] || m.tom });
    el.querySelector('#r').innerHTML = f.termo ? res.slice(0, 200).map(m => itemMusica(m, opcao(m))).join('') || '<p class="vazio">Nada encontrado.</p>' : listaAlfabetica(res, opcao);
  };
  el.querySelector('#b').oninput = e => { f.termo = e.target.value; desenhar(); };
  el.querySelector('#t').onchange = e => { f.tempo = +e.target.value || null; desenhar(); };
  el.querySelector('#p').onchange = e => { f.parte = +e.target.value || null; desenhar(); };
  el.querySelector('#limpar')?.addEventListener('click', () => { it.chave = null; it.tom = null; fechar(); aoEscolher(); });
  el.querySelector('#r').addEventListener('click', e => {
    const a = e.target.closest('[data-chave]'); if (!a) return;
    e.preventDefault();
    const m = musica(a.dataset.chave);
    const escolher = ch => { trocarChave(it, ch); fechar(); aoEscolher(); };
    if (m.totalVersoes < 2) return escolher(m.chave);
    // Mais de uma melodia: escolher a versão
    const r = el.querySelector('#r');
    const rolagem = el.scrollTop;
    r.innerHTML = `<button class="btn peq" id="voltar">‹ Voltar à lista</button><h2>${esc(m.nome)}: qual versão?</h2><div id="v"></div>`;
    el.scrollTop = r.offsetTop - 10;
    listaVersoes(r.querySelector('#v'), m, escolher);
    r.querySelector('#voltar').onclick = ev => { ev.stopPropagation(); desenhar(); el.scrollTop = rolagem; };
  });
  desenhar();
  el.querySelector('#b').focus();
}

function trocarChave(it, chave) {
  it.chave = chave;
  it.tom = estado.tons[chave] || null;
}

// Lista as versões de uma música com prévia das primeiras linhas, para comparar as melodias
export function listaVersoes(alvo, m, aoEscolher) {
  alvo.innerHTML = versoes(m).map(v => {
    const r = rotuloVersao(v);
    const previa = (v.chordpro || '').split('\n').filter(l => l.trim()).slice(0, 2).join('\n');
    return `<button class="item versao-item${v.chave === m.chave ? ' atual' : ''}" data-v="${esc(v.chave)}" style="width:100%;text-align:left;align-items:flex-start">
      <span class="tom">${esc(estado.tons[v.chave] || v.tom || '—')}</span>
      <span class="info"><span class="nome">${esc(r.titulo)}</span>${r.desc ? `<div class="comp">${esc(r.desc)}</div>` : ''}
        ${previa ? `<pre class="previa">${esc(previa.replace(/\[([^\]]*)\]/g, '[$1]'))}</pre>` : ''}</span></button>`;
  }).join('');
  alvo.onclick = e => { const b = e.target.closest('[data-v]'); if (b) { e.stopPropagation(); aoEscolher(b.dataset.v); } };
}

// A partir da tela de uma música: colocar numa missa existente ou nova
export function escolherMissaPara(m, tom) {
  const colocar = x => {
    const { el, fechar } = modal(`<h2 style="margin-top:0">Em qual parte de “${esc(x.titulo)}”?</h2>
      ${x.itens.map((it, i) => `<button class="item" style="width:100%;text-align:left" data-i="${i}"><span class="info"><span class="nome">${esc(it.rotulo)}</span>
        <div class="comp">${it.chave && musica(it.chave) ? 'Substituir: ' + esc(musica(it.chave).nome) : 'vazio'}</div></span>
        ${(m.partes || []).includes(it.parte) ? '<span class="selo">sugerido</span>' : ''}</button>`).join('')}
      <button class="btn" id="nova-parte">✚ Nova parte no fim</button>`);
    const pronto = () => { salvar(); fechar(); aviso(`Adicionada a “${x.titulo}”`); };
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      Object.assign(x.itens[+b.dataset.i], { chave: m.chave, tom: tom && tom !== m.tom ? tom : null });
      pronto();
    });
    el.querySelector('#nova-parte').onclick = () => {
      const parte = m.partes?.[0] || null;
      x.itens.push({ rotulo: parte ? nomeParte(parte).split(' / ')[0] : 'Canto', parte, chave: m.chave, tom: tom && tom !== m.tom ? tom : null });
      pronto();
    };
  };
  const missas = estado.missas.slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const { el, fechar } = modal(`<h2 style="margin-top:0">Pôr “${esc(m.nome)}” na missa</h2>
    ${missas.map(x => `<button class="item" style="width:100%;text-align:left" data-id="${x.id}"><span class="info"><span class="nome">${esc(x.titulo)}</span>
      <div class="comp">${x.data ? new Date(x.data + 'T12:00').toLocaleDateString('pt-BR') : ''}</div></span></button>`).join('')}
    <div class="barra"><button class="btn primario" id="nova">✚ Nova missa</button><button class="btn" data-fechar>Cancelar</button></div>`);
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    fechar(); colocar(achar(b.dataset.id));
  });
  el.querySelector('#nova').onclick = () => { fechar(); novaMissa(colocar); };
}
