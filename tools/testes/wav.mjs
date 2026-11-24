// Leitor mínimo de WAV PCM 16 bits (primeiro canal) para usar uma gravação REAL do ambiente como ruído nos testes.
// A gravação fica fora do repositório (é som do ambiente da pessoa): os testes recebem o caminho em AMBIENTE_WAV.
import { readFileSync } from 'node:fs';
export function lerWav(caminho) {
  const b = readFileSync(caminho); let p = 12, fmt = null, dados = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), n = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { canais: b.readUInt16LE(p + 10), taxa: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') { dados = b.subarray(p + 8, p + 8 + n); break; }
    p += 8 + n + (n % 2);
  }
  if (!fmt || !dados || fmt.bits !== 16) throw new Error('WAV não suportado (precisa ser PCM de 16 bits)');
  const n = Math.floor(dados.length / 2 / fmt.canais), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = dados.readInt16LE(i * 2 * fmt.canais) / 32768;
  return { x, taxa: fmt.taxa };
}
