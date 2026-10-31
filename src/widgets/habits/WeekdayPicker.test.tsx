import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { WeekdayPicker } from "./WeekdayPicker";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function pressedDays() {
  return DAYS.filter(
    (d) => screen.getByRole("button", { name: d }).getAttribute("aria-pressed") === "true",
  );
}

function Controlled({ initial, onChange }: { initial: number; onChange: (m: number) => void }) {
  const [mask, setMask] = useState(initial);
  return (
    <WeekdayPicker
      value={mask}
      onChange={(m) => {
        setMask(m);
        onChange(m);
      }}
    />
  );
}

describe("WeekdayPicker", () => {
  it("renders the mask as toggles (bit 0 = Monday … bit 6 = Sunday)", () => {
    render(<WeekdayPicker value={0b1000101} onChange={() => {}} />);
    expect(pressedDays()).toEqual(["Monday", "Wednesday", "Sunday"]);
  });

  it("round-trips toggles back to a mask", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={0b0000101} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Tuesday" }));
    expect(onChange).toHaveBeenLastCalledWith(0b0000111);

    await user.click(screen.getByRole("button", { name: "Monday" }));
    expect(onChange).toHaveBeenLastCalledWith(0b0000110);

    await user.click(screen.getByRole("button", { name: "Sunday" }));
    expect(onChange).toHaveBeenLastCalledWith(0b1000110);
    expect(pressedDays()).toEqual(["Tuesday", "Wednesday", "Sunday"]);
  });

  it("'Every day' preset sets 127 and 'Weekdays' sets 31", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={0b0000100} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Every day" }));
    expect(onChange).toHaveBeenLastCalledWith(127);
    expect(pressedDays()).toEqual(DAYS);

    await user.click(screen.getByRole("button", { name: "Weekdays" }));
    expect(onChange).toHaveBeenLastCalledWith(31);
    expect(pressedDays()).toEqual(DAYS.slice(0, 5));
  });

  it("clearing every toggle yields 0 (the form rejects it)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={0b0000001} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Monday" }));
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(pressedDays()).toEqual([]);
  });
});
