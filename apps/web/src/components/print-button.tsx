"use client";

export function PrintButton() {
  return (
    <button
      className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white print:hidden"
      onClick={() => window.print()}
      type="button"
    >
      Print or save PDF
    </button>
  );
}
