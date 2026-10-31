/**
 * A forma dos erros, numa função em vez de espalhada.
 *
 * A Fase 3 montava o objeto de erro à mão em cada rota, e com quatro rotas isso
 * passava. Com vinte, três delas teriam escrito `error: 'NotFound'` sem espaço
 * ou esquecido o `statusCode`, e quem consome a API precisaria tratar três
 * formas do mesmo erro.
 *
 * Os textos são os da especificação HTTP, em inglês, porque é o que o Fastify
 * usa nos erros que ele mesmo gera — uma validação de schema que falha devolve
 * `Bad Request`. Misturar "Requisição Inválida" nos nossos com "Bad Request" nos
 * dele daria duas convenções na mesma API. A **mensagem** é em português,
 * porque ela é para quem lê.
 */

export interface ApiError {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
}

export function notFound(message: string): ApiError {
  return { statusCode: 404, error: 'Not Found', message };
}

export function badRequest(message: string): ApiError {
  return { statusCode: 400, error: 'Bad Request', message };
}

export function conflict(message: string): ApiError {
  return { statusCode: 409, error: 'Conflict', message };
}

export function unprocessable(message: string): ApiError {
  return { statusCode: 422, error: 'Unprocessable Entity', message };
}
