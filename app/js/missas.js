// Montagem de missas: roteiro de cantos por parte da missa, troca de cantos e de tom
import { estado, musica, buscar, versoes, rotuloVersao, salvarMissas, salvarPrefs } from './dados.js';
import { esc, aviso, modal, confirmar, irPara, ORDEM_TEMPOS, COR_TEMPO, nomeTempo, nomeParte, listaAlfabetica, itemMusica } from './ui.js';
import { painelCifra, telaEditar } from './app.js';
import { chordproNoTom } from './cifra.js';
import { exportarMissa } from './exportar.js';

// Roteiro padrão: rótulo exibido e parte da missa usada para sugerir cantos
const ROTEIRO = [
  ['Entrada', 4], ['Ato penitencial', 5], ['Glória', 1], ['Salmo responsorial', 6], ['Aclamação ao Evangelho', 3],
  ['Apresentação das oferendas', 10], ['Santo', 2], ['Cordeiro de Deus', 15], ['Comunhão', 16],
  ['Ação de graças', 18], ['Final', 18],
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
      </span></a>`).join('') : '<p class="vazio">Nenhuma missa ainda. Crie uma e escolha os cantos de cada parte.</p>'}`;
  tela.querySelector('#nova').onclick = () => novaMissa();
}

export function novaMissa(aoCriar) {
  const hoje = new Date();
  const domingo = new Date(hoje); domingo.setDate(hoje.getDate() + ((7 - hoje.getDay()) % 7));
  const iso = domingo.toISOString().slice(0, 10);
  const tx = estado.taxonomia;
  const { el, fechar } = modal(`<h2 style="margin-top:0">Nova missa</h2>
    <form id="nm">
      <label class="campo"><span>Nome</span><input type="text" name="titulo" required value="Missa de domingo"></label>
      <label class="campo"><span>Data</span><input type="date" name="data" value="${iso}"></label>
      <label class="campo"><span>Tempo litúrgico</span><select name="tempo">${ORDEM_TEMPOS.filter(t => tx.tempos[t]).map(t => `<option value="${t}">${esc(tx.tempos[t])}</option>`).join('')}</select></label>
      <label class="campo"><span>Ano litúrgico</span><select name="ano"><option value="">—</option>${Object.entries(tx.anos).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
      <label><input type="checkbox" name="roteiro" checked> Já criar as partes da missa (Entrada, Glória, Salmo...)</label>
      <div class="barra" style="justify-content:flex-end"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primario">Criar</button></div>
    </form>`);
  const f = el.querySelector('#nm');
  const sugerir = () => {
    if (!f.data.value) return;
    const d = new Date(f.data.value + 'T12:00');
    f.tempo.value = tempoPorData(d);
    f.ano.value = anoPorData(d);
  };
  f.data.onchange = sugerir; sugerir();
  f.onsubmit = e => {
    e.preventDefault();
    const missa = { id: novoId(), titulo: f.titulo.value.trim() || 'Missa', data: f.data.value, tempo: +f.tempo.value || null,
      ano: +f.ano.value || null, itens: f.roteiro.checked ? ROTEIRO.map(([rotulo, parte]) => ({ rotulo, parte, chave: null, tom: null })) : [] };
    estado.missas.push(missa); estado.prefs.missaAtiva = missa.id; salvarPrefs(); foco.idx = null; salvar(); fechar();
    if (aoCriar) aoCriar(missa); else if (location.hash === '#/musicas') window.dispatchEvent(new Event('missa-mudou')); else location.hash = '#/musicas';
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
    <div id="corpo"></div>`;
  const corpo = tela.querySelector('#corpo');

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
