import { Decimal } from "decimal.js";
import { badRequestError } from "../../middleware/error-handler";

const MAX_DATABASE_DECIMAL = new Decimal("99999999999999.999999");

export function validateStoredDecimal(value: Decimal, field: string): Decimal {
  if (
    !value.isFinite() ||
    value.decimalPlaces() > 6 ||
    value.gt(MAX_DATABASE_DECIMAL)
  ) {
    badRequestError(`${field} must fit NUMERIC(20,6)`);
  }
  return value;
}
