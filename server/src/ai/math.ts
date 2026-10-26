/** Safe arithmetic evaluator for worked-example checks. No eval, no identifiers. */
export function evalArithmetic(expr: string): number {
  const src = expr.replace(/\s+/g, '').replace(/[×·]/g, '*').replace(/[÷:]/g, '/').replace(/−/g, '-').replace(/,/g, '.');
  if (!/^[0-9+\-*/^().]+$/.test(src)) throw new Error('unsupported characters');
  let i = 0;
  const peek = () => src[i];
  function num(): number {
    const m = src.slice(i).match(/^\d+(\.\d+)?|^\.\d+/);
    if (!m) throw new Error('number expected');
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function atom(): number {
    if (peek() === '(') {
      i++;
      const v = add();
      if (peek() !== ')') throw new Error('missing )');
      i++;
      return v;
    }
    if (peek() === '-') {
      i++;
      return -atom();
    }
    if (peek() === '+') {
      i++;
      return atom();
    }
    return num();
  }
  function pow(): number {
    const b = atom();
    if (peek() === '^') {
      i++;
      const e = pow(); // right-assoc
      return Math.pow(b, e);
    }
    return b;
  }
  function mul(): number {
    let v = pow();
    while (peek() === '*' || peek() === '/') {
      const op = src[i++];
      const r = pow();
      if (op === '/' && r === 0) throw new Error('division by zero');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function add(): number {
    let v = mul();
    while (peek() === '+' || peek() === '-') {
      const op = src[i++];
      const r = mul();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const out = add();
  if (i !== src.length) throw new Error('unexpected token');
  if (!Number.isFinite(out)) throw new Error('not finite');
  return out;
}

export function checkArithmetic(expression: string, expected: number): { ok: boolean; actual?: number; error?: string } {
  try {
    const actual = evalArithmetic(expression);
    return { ok: Math.abs(actual - expected) <= 1e-6 * Math.max(1, Math.abs(expected)), actual };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
