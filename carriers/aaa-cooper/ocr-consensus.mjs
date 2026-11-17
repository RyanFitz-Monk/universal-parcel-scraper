/** Original pixels and two uncropped thresholds must agree on six digits. */
export function aaaCooperConsensus(answers) {
  return Array.isArray(answers) && answers.length === 3
    && answers.every(answer => typeof answer === 'string' && /^\d{6}$/.test(answer) && answer === answers[0]) ? answers[0] : '';
}
