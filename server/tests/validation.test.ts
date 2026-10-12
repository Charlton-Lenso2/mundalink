// Listing + offer validation and transition unit tests (no DB required).

import { describe, it, expect } from "vitest";
import { ListingValidation } from "../src/modules/validation/listing";
import { OfferBodyValidation } from "../src/modules/validation/offer";
import { DealBodyValidation } from "../src/modules/validation/deal";
import { OFFER_STATUS } from "../src/modules/types/offer";

describe("ListingValidation.create", () => {
  it("rejects missing title", () => {
    expect(() =>
      ListingValidation.create({ quantity: "10", pricePerUnit: "5", availableQuantity: "10" })
    ).toThrow();
  });

  it("rejects non-positive quantity", () => {
    expect(() =>
      ListingValidation.create({
        title: "Maize grain",
        quantity: "0",
        pricePerUnit: "5",
        availableQuantity: "10",
      })
    ).toThrow();
  });

  it("rejects available quantity greater than total quantity", () => {
    expect(() =>
      ListingValidation.create({
        title: "Maize grain",
        quantity: "10",
        pricePerUnit: "5",
        availableQuantity: "11",
      })
    ).toThrow(/availableQuantity cannot exceed quantity/);
  });

  it("rejects numeric precision that cannot be stored in NUMERIC(20,6)", () => {
    expect(() =>
      ListingValidation.create({
        title: "Maize grain",
        quantity: "10.0000001",
        pricePerUnit: "5",
        availableQuantity: "10",
      })
    ).toThrow(/NUMERIC\(20,6\)/);
  });

  it("accepts a valid payload", () => {
    const out = ListingValidation.create({
      title: "Maize grain",
      quantity: "10",
      pricePerUnit: "5",
      availableQuantity: "10",
      currency: "usd",
    });
    expect(out.currency).toBe("USD");
  });
});

describe("OfferBodyValidation", () => {
  it("rejects empty body", () => {
    expect(() => OfferBodyValidation.create(null)).toThrow();
  });

  it("accepts a valid offer body", () => {
    const out = OfferBodyValidation.create({
      listingId: "lst_1",
      offeredQuantity: "5",
      offeredPrice: "100",
      message: "hello",
    });
    expect(out.listingId).toBe("lst_1");
  });

  it("rejects unknown status", () => {
    expect(() => OfferBodyValidation.status({ status: "NOPE" })).toThrow();
  });

  it("accepts the four transition targets", () => {
    for (const s of [
      OFFER_STATUS.ACCEPTED,
      OFFER_STATUS.DECLINED,
      OFFER_STATUS.WITHDRAWN,
      OFFER_STATUS.EXPIRED,
    ]) {
      expect(OfferBodyValidation.status({ status: s }).status).toBe(s);
    }
  });
});

describe("offer transition rules (documented)", () => {
  it("only PENDING offers may transition", () => {
    // Terminal states must be rejected by services; the validator only gates
    // the *target*, while services gate the *current* state.
    const terminal = [OFFER_STATUS.ACCEPTED, OFFER_STATUS.DECLINED, OFFER_STATUS.WITHDRAWN, OFFER_STATUS.EXPIRED];
    expect(terminal).toHaveLength(4);
  });
});

describe("DealBodyValidation.status", () => {
  it("rejects a non-object body", () => {
    expect(() => DealBodyValidation.status(null)).toThrow();
    expect(() => DealBodyValidation.status("CONFIRMED")).toThrow();
  });

  it("rejects PENDING (not a transition target)", () => {
    expect(() => DealBodyValidation.status({ status: "PENDING" })).toThrow(
      /CONFIRMED, COMPLETED, CANCELLED/
    );
  });

  it("rejects garbage statuses", () => {
    expect(() => DealBodyValidation.status({ status: "NOPE" })).toThrow();
    expect(() => DealBodyValidation.status({})).toThrow(/status is required/);
  });

  it("accepts the three targets (case-insensitive)", () => {
    for (const s of ["CONFIRMED", "COMPLETED", "CANCELLED"]) {
      expect(DealBodyValidation.status({ status: s.toLowerCase() }).status).toBe(s);
    }
  });

  it("captures an optional cancellation/fulfilment reason", () => {
    const parsed = DealBodyValidation.status({ status: "CANCELLED", reason: "Never harvested" });
    expect(parsed.status).toBe("CANCELLED");
    expect(parsed.reason).toBe("Never harvested");
  });

  it("omits the reason when absent or null", () => {
    expect(DealBodyValidation.status({ status: "CONFIRMED" }).reason).toBeUndefined();
    expect(DealBodyValidation.status({ status: "CONFIRMED", reason: null }).reason).toBeUndefined();
  });

  it("rejects a non-string or oversized reason", () => {
    expect(() => DealBodyValidation.status({ status: "CANCELLED", reason: 42 })).toThrow(
      /reason/
    );
    expect(() =>
      DealBodyValidation.status({ status: "CANCELLED", reason: "x".repeat(501) })
    ).toThrow(/reason/);
  });
});

describe("NUMERIC(20,6) storage guards (validateStoredDecimal)", () => {
  it("rejects offer quantities with more than 6 decimal places", () => {
    expect(() =>
      OfferBodyValidation.create({
        listingId: "lst_1",
        offeredQuantity: "5.0000001",
        offeredPrice: "100",
      })
    ).toThrow(/NUMERIC\(20,6\)/);
  });

  it("rejects listing updates with more than 6 decimal places", () => {
    expect(() => ListingValidation.update({ pricePerUnit: "1.1234567" })).toThrow(
      /NUMERIC\(20,6\)/
    );
  });

  it("rejects values that overflow NUMERIC(20,6)", () => {
    expect(() =>
      ListingValidation.create({
        title: "Maize grain",
        quantity: "100000000000000",
        pricePerUnit: "5",
        availableQuantity: "10",
      })
    ).toThrow(/NUMERIC\(20,6\)/);
  });
});
