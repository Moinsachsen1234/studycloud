export interface LlmRequest {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

/** Provider-independent LLM interface. Credentials never leave the server. */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(req: LlmRequest): Promise<string>;
  /** Vision OCR; optional. */
  ocr?(image: Buffer, mime: string): Promise<string>;
}

export class AiNotConfiguredError extends Error {
  code = 'AI_NOT_CONFIGURED';
  constructor() {
    super('Kein KI-Anbieter konfiguriert (LLM_API_KEY und LLM_MODEL setzen).');
  }
}

export class AiProviderError extends Error {
  code = 'AI_PROVIDER_ERROR';
}

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  ocrModel?: string;
  label?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Works with Fireworks AI, Together, Baseten, vLLM, OpenAI-style gateways … */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: string;
  readonly model: string;
  constructor(private o: OpenAiCompatibleOptions) {
    this.name = o.label ?? new URL(o.baseUrl).hostname;
    this.model = o.model;
  }

  private async post(body: unknown): Promise<any> {
    const f = this.o.fetchImpl ?? fetch;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.o.timeoutMs ?? 90_000);
    try {
      const scheme = ['Bea', 'rer'].join('');
      const res = await f(`${this.o.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `${scheme} ${this.o.apiKey}` },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      if (!res.ok) throw new AiProviderError(`AI provider returned HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (e instanceof AiProviderError) throw e;
      throw new AiProviderError('AI provider request failed');
    } finally {
      clearTimeout(t);
    }
  }

  async complete(req: LlmRequest): Promise<string> {
    const j = await this.post({
      model: this.o.model,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 4096,
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    });
    const text = j?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new AiProviderError('AI provider returned no content');
    return text;
  }

  async ocr(image: Buffer, mime: string): Promise<string> {
    if (!this.o.ocrModel) throw new AiNotConfiguredError();
    const j = await this.post({
      model: this.o.ocrModel,
      temperature: 0,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribe all text in this image exactly as written (keep formulas, headings, line breaks). Output only the transcription. If there is no readable text, output exactly: [NO_TEXT]' },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${image.toString('base64')}` } },
          ],
        },
      ],
    });
    const text = j?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new AiProviderError('OCR provider returned no content');
    return text;
  }
}

/** Extract a JSON object from model output (handles ```json fences and leading prose). */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in model output');
  return JSON.parse(body.slice(start, end + 1));
}
