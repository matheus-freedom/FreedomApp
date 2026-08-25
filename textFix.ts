// ════════════════════════════════════════════════════════════════
// Conserto de texto "escapado" vindo da IA
// ────────────────────────────────────────────────────────────────
// De vez em quando o modelo devolve, DENTRO do JSON, a quebra de
// linha escrita como texto ("\n" literal — barra + letra n) em vez
// da quebra de linha de verdade. O JSON.parse não tem como saber
// que aquilo era para ser uma quebra, então o texto chega à tela
// com "\n\n" no meio (foi o que um aluno viu no reading).
//
// Este módulo troca essas sequências pelo caractere real. É seguro:
// nenhum exercício de inglês legítimo contém "\n" como conteúdo.
// Aplicado em DOIS momentos: ao receber conteúdo do banco (conserta
// as atividades antigas já gravadas com o defeito) e ao interpretar
// gerações novas (para não gravar mais nada errado).
// ════════════════════════════════════════════════════════════════

export const fixEscapedText = (s: string): string =>
  s
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ');

// Percorre um objeto inteiro (arrays e sub-objetos inclusos) e
// aplica o conserto em TODAS as strings — questões, opções,
// explicações, textos de leitura, roteiros de áudio, tudo.
export const deepFixEscapedText = <T>(value: T): T => {
  if (typeof value === 'string') return fixEscapedText(value) as unknown as T;
  if (Array.isArray(value)) return value.map(deepFixEscapedText) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = deepFixEscapedText((value as Record<string, unknown>)[key]);
    }
    return out as T;
  }
  return value;
};
