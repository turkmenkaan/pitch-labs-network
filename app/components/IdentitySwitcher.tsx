"use client";

import { useRef } from "react";
import { setIdentity } from "../actions";

type Person = { id: string; name: string };

export function IdentitySwitcher({
  advisors,
  founders,
  currentValue,
}: {
  advisors: Person[];
  founders: Person[];
  currentValue: string; // "advisor:<id>" | "founder:<id>"
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={setIdentity} className="switcher">
      <label htmlFor="identity-select">Viewing as</label>
      <select
        id="identity-select"
        name="identity"
        defaultValue={currentValue}
        onChange={() => formRef.current?.requestSubmit()}
      >
        <optgroup label="Advisors">
          {advisors.map((a) => (
            <option key={a.id} value={`advisor:${a.id}`}>
              {a.name} (advisor)
            </option>
          ))}
        </optgroup>
        <optgroup label="Founders">
          {founders.map((f) => (
            <option key={f.id} value={`founder:${f.id}`}>
              {f.name} (founder)
            </option>
          ))}
        </optgroup>
      </select>
    </form>
  );
}
