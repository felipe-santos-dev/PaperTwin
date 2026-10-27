import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('aplica os padrões de desenvolvimento quando nada é definido', () => {
    const env = loadEnv({});
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3333,
      HOST: '127.0.0.1',
      LOG_LEVEL: 'info',
    });
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('converte PORT de string para número', () => {
    expect(loadEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('trata DATABASE_URL vazio como ausente, para cair no PGlite', () => {
    expect(loadEnv({ DATABASE_URL: '' }).DATABASE_URL).toBeUndefined();
  });

  it('aceita uma URL de conexão do Postgres', () => {
    const url = 'postgres://mp1:mp1@127.0.0.1:5432/mp1_twin';
    expect(loadEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it('falha na largada com configuração inválida', () => {
    expect(() => loadEnv({ PORT: '0' })).toThrow(/PORT/);
    expect(() => loadEnv({ LOG_LEVEL: 'barulhento' })).toThrow(/LOG_LEVEL/);
    expect(() => loadEnv({ DATABASE_URL: 'isto-não-é-url' })).toThrow(/DATABASE_URL/);
  });
});
