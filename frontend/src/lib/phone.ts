import { COUNTRIES } from "../data/countries";

/**
 * A light international phone formatter for the settings/profile screens. The
 * kernel stores Telegram's raw E.164 digits (e.g. `886905462282`); Telegram Web
 * shows the number with its dial code and national grouping
 * (`+886 905 462 282`), which is what the Web K profile header expects.
 *
 * This deliberately avoids a full libphonenumber dependency: the dial code is
 * found in the bundled country table (longest match wins), then the national
 * number is grouped by a small table of the regions this app is localised for
 * and a readable 3-digit fallback for everywhere else.
 */
export function formatPhoneNumber(raw?: string): string | undefined {
  const value = (raw ?? "").trim();
  if (!value) {
    return undefined;
  }
  if (value.startsWith("+")) {
    return value;
  }

  const digits = value.replace(/\D/gu, "");
  if (!digits) {
    return value;
  }

  const dials = [...COUNTRIES]
    .map((country) => country.dial)
    .filter((dial) => dial.startsWith("+") && dial.length > 1)
    .sort((left, right) => right.length - left.length);
  const dial = dials.find((candidate) =>
    digits.startsWith(candidate.slice(1)),
  );
  if (!dial) {
    return `+${groupDigits(digits, 3)}`;
  }

  const code = dial.slice(1);
  const national = digits.slice(code.length);
  if (!national) {
    return dial;
  }
  return `${dial} ${groupNational(national, code)}`;
}

function groupNational(national: string, dialCode: string): string {
  const groups: Record<string, number[]> = {
    // Region code -> group sizes, with the last group taking the remainder.
    "86": [3, 4, 4],
    "886": [3, 3, 3],
    "852": [4, 4],
    "853": [4, 4],
    "81": [2, 4, 4],
    "82": national.length >= 10 ? [3, 4, 4] : [2, 3, 4],
    "1": [3, 3, 4],
    "44": [4, 3, 4],
    "65": [4, 4],
    "60": [2, 3, 4],
    "66": [3, 3, 4],
    "84": [3, 3, 4],
    "91": [5, 5],
  };
  const sizes = groups[dialCode];
  if (sizes) {
    let index = 0;
    const parts: string[] = [];
    for (const size of sizes) {
      const part = national.slice(index, index + size);
      if (part) {
        parts.push(part);
      }
      index += size;
    }
    if (index < national.length) {
      parts.push(national.slice(index));
    }
    return parts.join(" ");
  }
  return groupDigits(national, 3);
}

function groupDigits(digits: string, size: number): string {
  const parts: string[] = [];
  for (let index = 0; index < digits.length; index += size) {
    parts.push(digits.slice(index, index + size));
  }
  return parts.join(" ");
}
