/**
 * Lightweight math notation for Phase 1 (no native TeX engine): converts a practical LaTeX subset inside $…$ / $$…$$
 * into readable Unicode (fractions as a⁄b, super/subscripts, Greek, operators). Unknown commands are shown verbatim so
 * nothing is silently dropped. A real renderer (KaTeX on web / react-native-math-view) can replace this later.
 */
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', n: 'ⁿ', x: 'ˣ', '(': '⁽', ')': '⁾' };
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', n: 'ₙ', x: 'ₓ', i: 'ᵢ', a: 'ₐ', e: 'ₑ', o: 'ₒ' };
const CMD: Record<string, string> = {
  cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', infty: '∞', rightarrow: '→', to: '→', Rightarrow: '⇒', leftarrow: '←', rightleftharpoons: '⇌',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', phi: 'φ', omega: 'ω', Omega: 'Ω',
  degree: '°', circ: '°', sqrt: '√', sum: '∑', int: '∫', partial: '∂', cdots: '⋯', ldots: '…', in: '∈', cup: '∪', cap: '∩', emptyset: '∅',
};

function mapChars(s: string, table: Record<string, string>): string | null {
  let out = '';
  for (const ch of s) {
    const m = table[ch];
    if (!m) return null;
    out += m;
  }
  return out;
}

export function texToUnicode(tex: string): string {
  let s = tex;
  // \frac{a}{b} → (a)⁄(b)  (parentheses only when needed)
  const wrap = (x: string) => (/^[\w.,]+$/.test(x) ? x : `(${x})`);
  for (let i = 0; i < 4; i++) s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${wrap(a)}⁄${wrap(b)}`);
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a) => `√${wrap(a)}`);
  s = s.replace(/\\text\s*\{([^{}]*)\}/g, '$1').replace(/\\(?:mathrm|mathbf|mathit)\s*\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\([A-Za-z]+)/g, (m, c) => CMD[c] ?? m);
  s = s.replace(/\^\{([^{}]*)\}/g, (m, a) => mapChars(a, SUP) ?? `^(${a})`).replace(/\^([0-9nx+\-−])/g, (_, a) => SUP[a] ?? `^${a}`);
  s = s.replace(/_\{([^{}]*)\}/g, (m, a) => mapChars(a, SUB) ?? `_(${a})`).replace(/_([0-9nxiaeo+\-])/g, (_, a) => SUB[a] ?? `_${a}`);
  return s.replace(/\\,|\\;|\\ /g, ' ').replace(/[{}]/g, '');
}

export interface MathPart {
  text: string;
  math: boolean;
  display?: boolean;
}

/** Split text into plain and math parts ($…$, $$…$$). Unbalanced `$` stays plain text. */
export function splitMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), math: false });
    parts.push({ text: texToUnicode((m[1] ?? m[2]).trim()), math: true, display: m[1] !== undefined });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), math: false });
  return parts;
}
