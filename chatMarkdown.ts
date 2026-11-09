// ════════════════════════════════════════════════════════════════
// Markdown do chat do Fred → blocos que o React desenha
// ────────────────────────────────────────────────────────────────
// O Gemini responde em Markdown: **negrito**, *itálico*, listas com
// "*" ou "-", listas numeradas, títulos com "#", tabelas com "|".
// Antes, o chat só APAGAVA alguns desses símbolos (o "**" e o "#"),
// então o asterisco simples do itálico e o "*" das listas apareciam
// crus na tela ("* *Example:* ...").
//
// Agora o texto é INTERPRETADO: cada linha vira um bloco com tipo
// (parágrafo, item de lista, título...) e cada trecho vira um pedaço
// com estilo (negrito, itálico, código). O componente GuideChat só
// desenha esses blocos.
//
// Por que não usar uma biblioteca de Markdown pronta? Porque a
// maioria gera HTML, e o app NUNCA injeta HTML vindo da IA (seria
// uma porta para código malicioso). Aqui tudo vira texto puro dentro
// de elementos React — o React escapa tudo sozinho.
//
// Funções puras (sem React, sem Firebase) → testadas em test-chat.mjs.
// ════════════════════════════════════════════════════════════════

import { fixEscapedText } from './textFix';

export interface InlinePiece {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export type ChatBlock =
  | { type: 'p'; pieces: InlinePiece[] }
  | { type: 'h'; pieces: InlinePiece[] }
  | { type: 'li'; depth: number; marker: string; ordered: boolean; pieces: InlinePiece[] }
  | { type: 'hr' }
  | { type: 'table'; header: InlinePiece[][]; rows: InlinePiece[][][] };

// ── Trechos dentro de uma linha ─────────────────────────────────
// A ordem das alternativas importa: "***" antes de "**", e "**"
// antes de "*", senão o negrito seria lido como dois itálicos.
//
// O itálico com "_" só vale entre fronteiras de palavra. Motivo:
// exercícios de gramática usam lacunas "___" ("She ___ to school"),
// e elas NÃO podem virar itálico.
const INLINE_RE = new RegExp(
  [
    '\\*\\*\\*([^*]+?)\\*\\*\\*',                 // 1: ***negrito+itálico***
    '\\*\\*([^*]+?)\\*\\*',                       // 2: **negrito**
    '(?<![\\w_])__([^_]+?)__(?![\\w_])',          // 3: __negrito__
    '\\*([^*\\s](?:[^*]*?[^*\\s])?)\\*',          // 4: *itálico*
    '(?<![\\w_])_([^_\\s](?:[^_]*?[^_\\s])?)_(?![\\w_])', // 5: _itálico_
    '`([^`]+)`',                                  // 6: `código`
  ].join('|'),
  'g'
);

export const parseInline = (line: string): InlinePiece[] => {
  const pieces: InlinePiece[] = [];
  const pushText = (t: string) => {
    // Asteriscos duplos que sobraram sem par (a IA às vezes esquece
    // de fechar o negrito) são removidos para não aparecerem crus.
    const cleaned = t.replace(/\*\*/g, '');
    if (cleaned) pieces.push({ text: cleaned });
  };
  let last = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(line)) !== null) {
    if (m.index > last) pushText(line.slice(last, m.index));
    if (m[1] !== undefined) pieces.push({ text: m[1], bold: true, italic: true });
    else if (m[2] !== undefined) pieces.push({ text: m[2], bold: true });
    else if (m[3] !== undefined) pieces.push({ text: m[3], bold: true });
    else if (m[4] !== undefined) pieces.push({ text: m[4], italic: true });
    else if (m[5] !== undefined) pieces.push({ text: m[5], italic: true });
    else if (m[6] !== undefined) pieces.push({ text: m[6], code: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) pushText(line.slice(last));
  return pieces;
};

// ── Linhas → blocos ─────────────────────────────────────────────
const HR_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const H_RE = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/;
const UL_RE = /^(\s*)[*\-•+]\s+(.*)$/;
const OL_RE = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const TABLE_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

// Recuo → profundidade. A IA recua com 2, 3 ou 4 espaços (ou tab);
// qualquer recuo de 2+ conta como um nível, 5+ como dois, e paramos
// em 3 para não espremer o texto numa janela estreita.
const depthOf = (indent: string): number => {
  const n = indent.replace(/\t/g, '    ').length;
  if (n < 2) return 0;
  return Math.min(3, n < 5 ? 1 : n < 8 ? 2 : 3);
};

const splitRow = (line: string): string[] =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

export const parseChatMarkdown = (raw: string): ChatBlock[] => {
  const text = fixEscapedText(raw || '').replace(/\r\n?/g, '\n').trim();
  const lines = text.split('\n');
  const blocks: ChatBlock[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'p', pieces: parseInline(para.join('\n')) });
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) { flushPara(); continue; }

    // Tabela: 2+ linhas seguidas começando e terminando com "|",
    // sendo a segunda a linha separadora (|---|---|).
    if (TABLE_RE.test(line) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      flushPara();
      const header = splitRow(line).map(parseInline);
      const rows: InlinePiece[][][] = [];
      i += 2;
      while (i < lines.length && TABLE_RE.test(lines[i])) {
        rows.push(splitRow(lines[i]).map(parseInline));
        i++;
      }
      i--; // o for incrementa de novo
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (HR_RE.test(line)) { flushPara(); blocks.push({ type: 'hr' }); continue; }

    let m = line.match(H_RE);
    if (m) { flushPara(); blocks.push({ type: 'h', pieces: parseInline(m[1]) }); continue; }

    m = line.match(OL_RE);
    if (m) {
      flushPara();
      blocks.push({ type: 'li', depth: depthOf(m[1]), marker: `${m[2]}.`, ordered: true, pieces: parseInline(m[3]) });
      continue;
    }

    m = line.match(UL_RE);
    if (m) {
      flushPara();
      blocks.push({ type: 'li', depth: depthOf(m[1]), marker: '•', ordered: false, pieces: parseInline(m[2]) });
      continue;
    }

    // Linha comum. Se vier logo depois de um item de lista e estiver
    // recuada, é continuação do item (a IA quebra linhas longas).
    const prev = blocks[blocks.length - 1];
    if (!para.length && prev && prev.type === 'li' && /^\s{2,}\S/.test(line)) {
      prev.pieces.push({ text: ' ' }, ...parseInline(line.trim()));
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return blocks;
};

// Texto puro, sem nenhum símbolo de Markdown — usado nas prévias da
// aba Histórico (onde só cabe uma linha).
export const chatPlainText = (raw: string): string =>
  parseChatMarkdown(raw)
    .map(b => {
      if (b.type === 'hr') return '';
      if (b.type === 'table') return [b.header, ...b.rows].map(r => r.map(c => c.map(p => p.text).join('')).join(' · ')).join(' ');
      const t = b.pieces.map(p => p.text).join('');
      return b.type === 'li' ? `${b.marker} ${t}` : t;
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
