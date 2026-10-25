/**
 * Cron que dispara com a rodada anterior ainda em curso pula a nova: feeds lentos
 * faziam duas ingestões rodarem ao mesmo tempo e gravarem o mesmo lote duas vezes.
 */
export function semSobreposicao(
  job: () => Promise<unknown>,
): () => Promise<void> {
  let rodando = false;
  return () => {
    if (rodando) {
      console.warn("[job] rodada anterior ainda em curso; esta foi pulada");
      return Promise.resolve();
    }
    rodando = true;
    return job()
      .then(() => undefined)
      .catch(console.error)
      .finally(() => {
        rodando = false;
      });
  };
}
