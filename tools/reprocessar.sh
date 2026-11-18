#!/bin/sh
# Refaz todas as cifras do acervo a partir dos arquivos já baixados (tools/cache), na ordem certa:
#  1) cifras em PDF de texto  2) cifras escaneadas (OCR, do cache)
#  3) partituras -> cifra (e cópia das partituras para o app)  4) versões repetidas no mesmo PDF
#  5) conferência das cifras com a partitura (sílaba exata de cada acorde)
#  6) transcrições feitas à mão (tools/transcricoes)
# Uso: sh tools/reprocessar.sh
set -e
cd "$(dirname "$0")/.."
node tools/reconverter-texto.mjs
node tools/ocr-escaneadas.mjs
node tools/partituras-cifra.mjs
node tools/separar-paginas.mjs
node tools/separar-copias.mjs
node tools/conferir-partituras.mjs
node tools/mscz-cifras.mjs
node tools/aplicar-transcricoes.mjs
node tools/limpar-letras.mjs
