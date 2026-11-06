"use client";

export function PrintButton() {
  return (
    <button className="btn" onClick={() => window.print()}>
      列印
    </button>
  );
}
