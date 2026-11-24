export interface FundableGift {
  price: number;
  stock?: number | null;
  totalQuotas?: number | null;
  isVaquinha?: boolean;
  raisedAmount?: number;
}

/**
 * Percentual (0-100) de quanto um presente já foi financiado.
 * stock<=0 é um corte manual ("Já Concluído?") que vale para qualquer modo.
 * Presentes binários (sem cotas/vaquinha) só existem em 0% ou 100%.
 */
export function getGiftFundingProgress(gift: FundableGift): number {
  if (gift.stock !== null && gift.stock !== undefined && gift.stock <= 0) {
    return 100;
  }

  if (gift.totalQuotas && gift.totalQuotas > 0) {
    const remaining = gift.stock ?? gift.totalQuotas;
    return Math.min(100, Math.max(0, ((gift.totalQuotas - remaining) / gift.totalQuotas) * 100));
  }

  if (gift.isVaquinha && gift.price > 0) {
    return Math.min(100, Math.max(0, ((gift.raisedAmount || 0) / gift.price) * 100));
  }

  return 0;
}

export function isGiftFundingComplete(gift: FundableGift): boolean {
  return getGiftFundingProgress(gift) >= 100;
}
