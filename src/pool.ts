/** Roda `fn` sobre a lista com no máximo `limit` chamadas em voo, na ordem. */
export async function pool<T, R>(
  list: T[],
  limit: number,
  fn: (x: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  let falhou = false;
  let primeiroErro: unknown;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      try {
        out[i] = await fn(list[i] as T);
      } catch (err) {
        // Espera os demais: quem chama não pode seguir com trabalho em voo.
        if (!falhou) primeiroErro = err;
        falhou = true;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, worker),
  );
  if (falhou) throw primeiroErro;
  return out;
}
