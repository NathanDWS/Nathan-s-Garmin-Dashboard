import { describe, expect, it } from "vitest";
import { inWindow, pace, periods, rolling, sumBy, weekStart } from "./metrics";

describe("periods", () => {
  const now = new Date(2026, 10, 23); // 23 nov 2026

  it("30 dagen compares with the 30 before", () => {
    const { current, prev } = periods(now, "30d");
    expect(current.start.toDateString()).toBe(new Date(2026, 9, 25).toDateString());
    expect(prev.end.toDateString()).toBe(new Date(2026, 9, 24).toDateString());
  });

  it("deze maand compares with the same span last month", () => {
    const { current, prev } = periods(now, "month");
    expect(current.start.getDate()).toBe(1);
    expect(prev.start.getMonth()).toBe(9);
    expect(prev.end.getDate()).toBe(23);
  });

  it("dit jaar compares with last year up to the same day", () => {
    const { current, prev } = periods(now, "year");
    expect(current.start.getFullYear()).toBe(2026);
    expect(prev.end.getFullYear()).toBe(2025);
    expect(prev.end.getMonth()).toBe(10);
  });
});

describe("helpers", () => {
  it("inWindow filters by date string inclusive", () => {
    const w = { start: new Date(2026, 0, 1), end: new Date(2026, 0, 31, 23, 59), label: "" };
    const rows = [{ date: "2025-12-31" }, { date: "2026-01-01" }, { date: "2026-01-31" }, { date: "2026-02-01" }];
    expect(inWindow(rows, w).map((r) => r.date)).toEqual(["2026-01-01", "2026-01-31"]);
  });

  it("sumBy ignores nulls", () => {
    expect(sumBy([{ v: 1 }, { v: null }, { v: 2 }], (r) => r.v)).toBe(3);
  });

  it("rolling averages skip nulls", () => {
    expect(rolling([1, null, 3, 5], 2)).toEqual([1, 1, 3, 4]);
  });

  it("pace formats min/km", () => {
    expect(pace(10000, 3000)).toBe("5:00");
    expect(pace(0, 3000)).toBe("–");
  });

  it("weekStart is monday", () => {
    expect(weekStart(new Date(2026, 10, 23)).getDay()).toBe(1);
    expect(weekStart(new Date(2026, 10, 23)).getDate()).toBe(23);
    expect(weekStart(new Date(2026, 10, 22)).getDate()).toBe(16);
  });
});
