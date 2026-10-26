// DEV-ONLY mock of an OpenAI-compatible /chat/completions endpoint.
// It exists so the full StudyCloud pipeline (real adapter, real validation, real source verification,
// live Wikipedia retrieval) can be exercised without a paid LLM key. It is NOT an integration with a real model
// and must never be used in production. Quotes are copied from the prompt so grounding checks can pass honestly.
import http from 'node:http';

const port = Number(process.env.MOCK_LLM_PORT ?? 8799);

function between(s, a, b) {
  const i = s.indexOf(a);
  if (i < 0) return '';
  const j = s.indexOf(b, i + a.length);
  return s.slice(i + a.length, j < 0 ? undefined : j);
}

function respond(user) {
  const material = between(user, '<untrusted_material>', '</untrusted_material>');
  const s1 = material.split(/\n/).slice(2).join(' ').replace(/\s+/g, ' ').trim(); // text after "[S1] (name)"
  const mQuote = s1.slice(0, 70);
  const evBlock = between(user, '<untrusted_evidence>', '</untrusted_evidence>');
  const e1Text = evBlock.split('\n').slice(2).join(' ').replace(/\s+/g, ' ').trim();
  const eQuote = e1Text.slice(0, 120);
  const hasEvidence = e1Text.length > 40 && /\[E1\]/.test(evBlock);

  if (user.includes('Analyze the student')) {
    return { subject_guess: 'Physik', grade_min: 7, grade_max: 9, concepts: [{ kind: 'definition', name: 'Kraft', description: 'Ursache von Beschleunigung' }, { kind: 'formula', name: 'F = m · a' }, { kind: 'misconception', name: 'Kraft und Geschwindigkeit verwechseln' }], objectives: ['Die Kraft aus Masse und Beschleunigung berechnen', 'Die Einheit Newton erklären'] };
  }
  if (user.includes('derive 3-6 concrete learning objectives')) {
    const research = user.includes('knowledge gaps');
    return { objectives: [{ key: 'O1', text: 'Kraft aus Masse und Beschleunigung berechnen' }, { key: 'O2', text: 'Das zweite newtonsche Gesetz einordnen' }], grade_min: 7, grade_max: 9, gaps: research ? [{ objective_key: 'O2', query: 'Newtonsche Gesetze', reason: 'Das Material nennt keine allgemeine Formulierung' }] : [] };
  }
  if (user.includes('Write a learning program')) {
    const blocks1 = [
      { type: 'explanation', title: 'Was ist Kraft?', text: 'Dein Material beschreibt den Zusammenhang zwischen **Kraft**, Masse und Beschleunigung: $F = m \\cdot a$.', origin: 'material', grounding: [{ kind: 'material', ref: 'S1', quote: mQuote }] },
      { type: 'worked_example', title: 'Beispiel: 2 kg, 3 m/s²', text: 'Ein Körper hat $m = 2\\,\\text{kg}$ und $a = 3\\,\\text{m/s}^2$. Dann gilt $F = 2 \\cdot 3 = 6\\,\\text{N}$.', origin: 'ai_explanation', grounding: [], checks: [{ expression: '2 * 3', expected: 6 }] },
      { type: 'common_mistake', title: 'Häufiger Fehler', text: 'Viele vergessen, dass die Beschleunigung in $\\text{m/s}^2$ angegeben wird – nicht in m/s.', origin: 'ai_explanation', grounding: [] },
    ];
    if (hasEvidence) blocks1.splice(1, 0, { type: 'explanation', title: 'Einordnung', text: 'Allgemein beschreibt das zweite newtonsche Gesetz, wie Kraft, Masse und Beschleunigung zusammenhängen (siehe Quelle).', origin: 'external', grounding: [{ kind: 'external', ref: 'E1', quote: eQuote, claim: eQuote }] });
    return {
      title: 'Kraft und Beschleunigung', description: 'Von der Formel F = m · a bis zu ersten Rechenbeispielen – passend zu deinen Unterlagen.', estimated_minutes: 25,
      lessons: [
        { title: 'Kraft verstehen', objective_keys: ['O1', 'O2'], estimated_minutes: 12, blocks: blocks1 },
        { title: 'Zusammenfassung und Wiederholung', objective_keys: ['O1'], estimated_minutes: 8, blocks: [
          { type: 'summary', title: 'Merke', text: 'Kraft = Masse mal Beschleunigung. Die Einheit ist das Newton (N).', origin: 'material', grounding: [{ kind: 'material', ref: 'S1' }] },
          { type: 'revision_activity', title: 'Wiederholen', text: 'Berechne die Kraft für $m = 5\\,\\text{kg}$ und $a = 2\\,\\text{m/s}^2$ und erkläre deinen Rechenweg.', origin: 'ai_explanation', grounding: [] },
        ] },
      ],
    };
  }
  // tutor
  const cites = [{ kind: 'material', ref: 'S1', quote: mQuote }];
  if (hasEvidence) cites.push({ kind: 'external', ref: 'E1', quote: eQuote, claim: eQuote });
  return { answer: 'Gute Frage! Kurz gesagt: **Kraft = Masse × Beschleunigung**, also $F = m \\cdot a$. Bei 2 kg und 3 m/s² sind das 6 N. Soll ich dir ein weiteres Beispiel Schritt für Schritt zeigen?', citations: cites };
}

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      const j = JSON.parse(body || '{}');
      const user = (j.messages?.find((m) => m.role === 'user')?.content) ?? '';
      const content = JSON.stringify(respond(typeof user === 'string' ? user : ''));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
    } catch (e) {
      res.writeHead(500);
      res.end('{}');
    }
  });
}).listen(port, '127.0.0.1', () => console.log(`mock-llm (DEV ONLY) on ${port}`));
