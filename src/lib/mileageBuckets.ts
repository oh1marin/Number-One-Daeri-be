/** 기프티콘 교환에 쓸 수 있는 마일리지 (가입 보너스 제외) */
export function gifticonSpendable(balance: number, signupBonusRemaining: number): number {
  const locked = Math.max(0, signupBonusRemaining);
  return Math.max(0, balance - locked);
}

/** 대리 마일리지 결제 시 가입 보너스 잔여 차감 */
export function nextSignupBonusAfterRideSpend(
  signupBonusRemaining: number,
  spendAmount: number,
): number {
  const locked = Math.max(0, signupBonusRemaining);
  const use = Math.min(Math.max(0, spendAmount), locked);
  return locked - use;
}
