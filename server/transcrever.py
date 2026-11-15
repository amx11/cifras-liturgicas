"""Transcreve um arquivo de áudio com faster-whisper e imprime JSON com o tempo de cada palavra.
Uso: python transcrever.py arquivo  ->  {"palavras": [{"texto", "inicio", "fim"}, ...]}
Usa a GPU NVIDIA quando disponível; senão, CPU."""
import json
import os
import sys

from faster_whisper import WhisperModel

MODELO = os.environ.get("WHISPER_MODELO", "small")


def carregar():
    try:
        return WhisperModel(MODELO, device="cuda", compute_type="float16")
    except Exception:
        return WhisperModel(MODELO, device="cpu", compute_type="int8")


def main():
    modelo = carregar()
    segmentos, _ = modelo.transcribe(sys.argv[1], language="pt", word_timestamps=True, vad_filter=True,
                                     condition_on_previous_text=False)
    palavras = []
    for s in segmentos:
        for p in s.words or []:
            texto = p.word.strip()
            if texto:
                palavras.append({"texto": texto, "inicio": round(p.start, 2), "fim": round(p.end, 2)})
    print(json.dumps({"palavras": palavras}, ensure_ascii=False))


if __name__ == "__main__":
    main()
