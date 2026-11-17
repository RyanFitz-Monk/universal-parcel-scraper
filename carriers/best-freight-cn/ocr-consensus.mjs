/** Original pixels and two uncropped median filters must read the same six digits. */
export function bestFreightCnConsensus(answers) {
  return Array.isArray(answers) && answers.length === 3 && answers.every(answer => typeof answer === 'string' && /^\d{6}$/.test(answer) && answer === answers[0]) ? answers[0] : '';
}
