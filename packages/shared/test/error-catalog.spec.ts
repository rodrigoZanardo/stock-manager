import { readFileSync } from 'fs';
import { join } from 'path';
import { AppError, ERROR_CODES, ErrorCode } from '../src/errors';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

// Every API error code must have a translation in the web app, so users never see untranslated text.
describe.each(['en', 'pt'])('web translations (%s)', (locale) => {
  const messages: { errors: Record<string, string> } = JSON.parse(
    readFileSync(join(__dirname, '../../../web/messages', `${locale}.json`), 'utf8'),
  );

  it.each(ERROR_CODES)('translates %s using only placeholders the API sends', (code) => {
    const translated = messages.errors[code];
    expect(translated).toEqual(expect.any(String));
    // a translation may leave a value out (INVALID_INPUT hides the English details),
    // but a placeholder the API never sends would reach the user as "{name}"
    const sent = placeholders(new AppError(code as ErrorCode).message);
    for (const name of placeholders(translated ?? '')) expect(sent).toContain(name);
  });
});
