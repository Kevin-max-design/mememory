const MEASUREMENT_CONTEXT = /(?:\d|mg|gm|g\/d|10|iu|ul|µl|μl|cumm|hpf|vol|fl|pg)/i;

/** Normalize OCR-confused measurement units for parsing while preserving raw source text. */
export function normalizeMedicalMeasurement(input: string): string {
  if (!MEASUREMENT_CONTEXT.test(input)) return input;
  return input
    .replace(/[×Xx]\s*10(?:\s*\^?\s*3|³)\s*\/\s*(?:[uµμ]\s*[lL1]|UL)\b/g, "x10^3/uL")
    .replace(/x\s*103\s*\/\s*(?:[uµμ]\s*[lL1]|UL)\b/gi, "x10^3/uL")
    .replace(/\bmg\s*\/\s*d(?:[lL1I]|i)\b/g, "mg/dl")
    .replace(/\bg(?:ms?|m)\s*%/gi, "gm%")
    .replace(/\bg\s*\/\s*d[lL]\b/g, "g/dl")
    .replace(/\bIUL\b/gi, "IU/L")
    .replace(/\bu[lI]U\s*\/\s*m[lL]\b/gi, "uIU/ml")
    .replace(/[µμ]IU\s*\/\s*m[lL]/g, "uIU/ml")
    .replace(/\bmillions?\s*\/\s*cumm\b/gi, "million/cumm")
    .replace(/\/\s*HPF\b/gi, "/hpf")
    .replace(/\bVol\s*%/gi, "Vol%")
    .replace(/\bf[lL]\b/g, "fL");
}
