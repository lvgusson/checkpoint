import type { ScoringConfig, ScoringFactor } from '../../../../../packages/core/src/models';
import { BONUS, OVERLAP, num, queueRule } from './settingsForm';

const off = (on: boolean) => (on ? undefined : 'off');

/** Live explanation of the formula with the weights being edited (greyed out when a rule is off). */
export function FormulaPanel({ d, context }: { d: ScoringConfig; context: ScoringFactor[] }) {
  const w = d.weights;
  return (
    <section className="panel formula-panel" aria-labelledby="formula-title">
      <span className="eyebrow">FÓRMULA</span>
      <h2 id="formula-title">Como cada jogo é pontuado</h2>
      <div className="formula">
        <p className="eq">
          <var>score</var> = <var>base</var> + <span className="op">Σ</span> ajustes ativos
        </p>
        <p className="eq">
          <var>base</var> ={' '}
          <span className={off(d.rules.desire)}>
            <b>{num(w.desire)}</b>·<var>D</var>
          </span>{' '}
          +{' '}
          <span className={off(d.rules.affinity)}>
            <b>{num(w.affinity)}</b>·<var>A</var>
          </span>{' '}
          +{' '}
          <span className={off(d.rules.duration)}>
            <b>{num(w.duration)}</b>·<var>T</var>
          </span>
        </p>
        <p className={'eq ' + (off(d.rules.affinity) ?? '')}>
          <var>A</var> = (A<sub>gênero</sub> + A<sub>ritmo</sub> + A<sub>mecânica</sub>) ÷ 3, &nbsp;
          A<sub>x</sub> ={' '}
          <span className="frac">
            <span>
              <b>{num(w.priorStrength)}</b>·<b>{num(w.neutralAffinity)}</b> + Σ 25·(nota − 1)
            </span>
            <span>
              <b>{num(w.priorStrength)}</b> + <var>n</var>
              <sub>x</sub>
            </span>
          </span>
        </p>
        <p className={'eq ' + (off(d.rules.duration) ?? '')}>
          <var>T</var> = limite<sub>0–100</sub>(100 + <b>{num(w.freeDurationHours)}</b> −{' '}
          <var>H</var>) &nbsp;<small>(sem tempo conhecido: T = 50)</small>
        </p>
        <p className="eq">
          <var>H</var> = horas estimadas × <var>f</var>, &nbsp;
          {d.rules.timeFactor ? (
            <>
              <var>f</var> = limite<sub>0,5–2</sub>(
              <span className="frac">
                <span>
                  2 + <var>m</var>·mediana(real ÷ estimado)
                </span>
                <span>
                  2 + <var>m</var>
                </span>
              </span>
              )
            </>
          ) : (
            <>
              <var>f</var> = 1 <small>(seu ritmo desligado)</small>
            </>
          )}
        </p>
        <p className="eq adjustments">
          <span className="op">Σ</span> ajustes ={' '}
          {context.map((f) => (
            <span
              key={f.id}
              className={['chip', !d.rules[f.rule!] && 'off', BONUS.has(f.id) && 'bonus']
                .filter(Boolean)
                .join(' ')}
            >
              {BONUS.has(f.id) ? '+' : '−'} {num(w[f.weight!])}
              {OVERLAP.has(f.id) && ' · sobreposição'} · [{f.label.toLowerCase()}]
            </span>
          ))}
        </p>
      </div>
      <ul className="legend">
        <li>
          <var>D</var> - vontade de jogar: Imediata e Muito Alta 100, Alta 75, Média 50, Baixa 25,
          Muito Baixa 0. Jogos com vontade Imediata vão para o topo da fila, entre si pelo score.
        </li>
        <li>
          <var>A</var> - afinidade bayesiana: média das suas notas (1–5 viram 0–100) nos{' '}
          <var>n</var>
          <sub>x</sub> jogos avaliados com o mesmo gênero, ritmo ou mecânica, puxada para a
          afinidade neutra com força <var>k</var> = {num(w.priorStrength)}.
        </li>
        <li>
          <var>T</var> - duração: quanto menor a estimativa <var>H</var>, maior. <var>f</var> é o
          seu ritmo, a mediana de horas reais ÷ estimadas dos <var>m</var> jogos finalizados,
          suavizada e limitada a 0,5×–2×.
        </li>
        <li>
          [condição] vale 1 quando é verdadeira e 0 quando não é. A fila é montada um jogo por vez:
          sempre entra o maior score entre os disponíveis. Depois, os jogos que você arrastou entram
          exatamente na posição fixada, empurrando os demais.
        </li>
        <li>{queueRule(d)}</li>
      </ul>
    </section>
  );
}
