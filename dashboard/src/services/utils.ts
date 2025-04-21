import Decimal from 'decimal.js';

export const formatAmount = (
  amount?: bigint | Decimal | number | string,
  minimumFractionDigits = 2,
  maximumFractionDigits = 2,
): string => {
  if (!amount) {
    return '0.00';
  }

  let decimalAmount: Decimal;
  if (typeof amount === 'bigint' || typeof amount === 'number' || typeof amount === 'string') {
    decimalAmount = new Decimal(amount.toString());
  } else {
    decimalAmount = amount;
  }

  return decimalAmount
    .div(1e6)
    .toNumber()
    .toLocaleString('en-US', { style: 'decimal', minimumFractionDigits, maximumFractionDigits });
};
