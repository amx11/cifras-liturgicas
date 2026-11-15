# Cifras Litúrgicas

App de cifras para a liturgia: acervo da Arquidiocese de Porto Alegre, busca, transposição para qualquer tom,
montagem de missas e reconhecimento de acordes pelo áudio.

## Como abrir no Windows

Dê dois cliques em **`Abrir Cifras Liturgicas.bat`**. Ele liga o servidor e abre o app no navegador
(http://localhost:8765). Para desligar, feche a janela preta.

No Edge ou Chrome, use o ícone **Instalar app** na barra de endereço para ter o app no menu Iniciar,
abrindo em janela própria e funcionando sem internet.

## O que o app faz

- **Músicas**: busca por título ou trecho da letra; filtros por tempo litúrgico, parte da missa e ano A/B/C;
  lista em ordem alfabética.
- **Cifra**: troca de tom com um toque (qualquer um dos 12), meio tom acima/abaixo, indicação de capotraste,
  tamanho da letra, ocultar acordes, rolagem automática, copiar, PDF original, vídeo e áudio da arquidiocese.
- **Painel da missa (à esquerda)**: a missa em montagem fica sempre à vista enquanto você escolhe os cantos
  (no celular, pelo botão “✚ Missa”). Ao criar a missa, o tempo litúrgico e o ano A/B/C vêm da data e a lista de
  cantos já abre filtrada. Toque numa parte (ex.: Comunhão) para ver só os cantos dela e use o **＋** ao lado de
  cada canto; se a parte já tiver canto, o novo entra logo depois (dá para ter vários cantos de comunhão).
- **Exportar PDF**: na missa ou no painel, “⬇ PDF” gera o arquivo com roteiro e todos os cantos, cada um no tom
  e na versão escolhidos. Opções: com ou sem acordes, um canto por página, letra maior.
- **Personalizar**: “✎ Personalizar” abre a cifra (já no tom da missa) para mudar a letra e/ou os acordes.
  Salva como **versão personalizada**: o original não muda e as duas aparecem como versões da mesma música.
- **Cifras escaneadas → texto**: as 330 cifras da arquidiocese que eram imagem foram convertidas com OCR
  (`node tools/ocr-escaneadas.mjs`), com cada acorde posicionado pela coordenada da letra na página.
  As que tiveram leitura duvidosa ficam marcadas **revisar** (filtro “Convertidas do escaneado: para revisar”).
  Na música, “Ver original” mostra o escaneado; “Revisar” abre o editor com o original ao lado e prévia ao vivo.
  A correção é gravada em `app/data/correcoes.json` (vale para todos os aparelhos) quando o servidor está ligado.
- **Missas**: roteiro pronto (Entrada, Ato penitencial, Glória, Salmo...). Ao escolher um canto, a lista já vem
  filtrada pelo tempo litúrgico da missa e pela parte. Cada canto guarda o seu tom. Modo “Ver cifras” mostra
  tudo em sequência; dá para imprimir/salvar em PDF e compartilhar a lista.
- **Versões**: quando a mesma letra tem mais de uma melodia, a lista mostra “N versões”. Ao pôr o canto na missa
  (ou na tela do canto) você escolhe a versão, vendo o tom e as primeiras linhas de cada uma.
  Dá para criar a sua própria versão (“Nova versão”) a partir de uma existente.
- **Tocar**: na missa, o botão **▶ Tocar** abre um canto por vez em tela cheia, com a tela sempre ligada. Em cada
  canto dá para trocar o tom e a versão na hora (a missa guarda a escolha), mudar o tamanho da letra e passar
  para o próximo (botão, setas do teclado ou deslizando o dedo).
- **Importar**: PDF de cifra (um ou vários), cifra colada de qualquer site, arquivo de áudio ou link do YouTube.
- **Ouvir**: mostra o acorde que está tocando pelo microfone, grava e cifra, e reconhece a música pelo trecho cantado.
- **Ajustes**: tema claro/escuro, fonte, backup das missas e músicas para levar a outro aparelho.

As missas, músicas próprias, edições e tons ficam salvos no próprio aparelho (use o backup em Ajustes).

## Atualizar o acervo da arquidiocese

```
node tools/importar-arquipoa.mjs
```

Baixa a lista, os PDFs (guardados em `tools/cache/`) e gera `app/data/musicas.json`; as cifras escaneadas
vão para `app/data/pdf/`. Leva cerca de 50 minutos na primeira vez.

Depois de reimportar:

```
node tools/baixar-partituras.mjs     # partituras (devagar: o site recusa downloads rápidos; ~2 h)
sh tools/reprocessar.sh              # refaz todas as cifras a partir do que foi baixado
```

O `reprocessar.sh` roda, nesta ordem:

1. `reconverter-texto.mjs` — cifras em PDF de texto;
2. `ocr-escaneadas.mjs` — cifras escaneadas (usa o cache em `tools/cache/ocr`; com `--refazer` lê tudo de
   novo, ~25 min em lotes paralelos `--lote=0/6` … `--lote=5/6`);
3. `partituras-cifra.mjs` — partitura → cifra (acorde na sílaba da nota; quando a partitura também traz o
   bloco de cifra digitado, vale o texto do bloco com a sílaba corrigida pela pauta) e cópia das
   partituras para `app/data/partitura/`;
4. `separar-paginas.mjs` — mesma música repetida no PDF (outro tom → anotado; "versão simplificada" →
   versão separada);
5. `conferir-partituras.mjs` — confere cada cifra com a partitura da mesma música (mesmo arranjo) e
   corrige a sílaba dos acordes deslocados na digitação.

## YouTube e letra automática (opcional)

Os acordes são reconhecidos no próprio app. Para baixar do YouTube e transcrever a letra, instale no WSL:

```
pip install yt-dlp faster-whisper
```

A transcrição usa a placa de vídeo NVIDIA quando disponível (modelo `small`; para mais precisão,
defina `WHISPER_MODELO=medium`). O resultado é um rascunho: revise antes de salvar.

## Leitura óptica de partitura (Audiveris, opcional)

O Audiveris lê partituras em imagem (escaneadas) e exporta MusicXML. Ele roda no servidor do computador:
o Importar pede a ele uma segunda leitura e fica com a melhor; o acervo também usa (`partituras-cifra.mjs`).
Instalação sem administrador (WSL/Ubuntu), com Java embutido:

```
curl -LO https://github.com/Audiveris/audiveris/releases/download/5.11.0/Audiveris-5.11.0-ubuntu24.04-x86_64.deb
mkdir -p ~/.local/audiveris/tessdata && dpkg-deb -x Audiveris-5.11.0-ubuntu24.04-x86_64.deb ~/.local/audiveris
cd ~/.local/audiveris/tessdata && curl -LO https://github.com/tesseract-ocr/tessdata/raw/main/por.traineddata \
  && curl -LO https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata
```

(Os idiomas precisam ser os do repositório `tessdata` completo: o Audiveris usa o motor legado do Tesseract.)

Arquivos **MusicXML** (.mxl/.musicxml, exportados do MuseScore ou Finale) podem ser importados direto no app
e viram cifra exata, sem leitura de imagem.

## Celular Android

O app está publicado em **https://amx11.github.io/cifras-liturgicas/** (GitHub Pages, branch `gh-pages`).
No Chrome do celular: menu ⋮ → “Instalar app”. Depois de aberto uma vez, funciona sem internet.

Para publicar uma atualização: `git subtree split --prefix app -b gh-pages && git push -f origin gh-pages`.

## Estrutura

- `app/` — o aplicativo (HTML, CSS, JS, sem dependências externas)
  - `js/cifra.js` — acordes, ChordPro, transposição, renderização
  - `js/acordes-audio.js` — reconhecimento de acordes por áudio
  - `js/dados.js`, `js/missas.js`, `js/importar.js`, `js/ouvir.js`, `js/app.js`
- `server/` — servidor local (app + YouTube + Whisper)
  - `js/ocr.js`, `js/ocr-cifra.js` — leitura de foto/PDF escaneado (Tesseract, sem internet)
  - `js/partitura.js` — partitura (PDF vetorial) → cifra; `js/conferir.js` — confere cifra × partitura
- `tools/` — importador do acervo da arquidiocese e conversões (veja acima)
