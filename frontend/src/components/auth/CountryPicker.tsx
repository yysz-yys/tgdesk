import { useEffect, useMemo, useRef, useState } from "react";
import { IconChevronDown, IconSearch } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  COUNTRIES,
  countryName,
  findCountry,
  flagEmoji,
  type Country,
} from "../../data/countries";

interface CountryPickerProps {
  value: string;
  onChange: (iso: string) => void;
  language: string;
  disabled?: boolean;
}

const PINNED = ["CN", "US", "GB", "JP", "KR", "RU", "IN", "DE", "FR", "SG"];

function orderedCountries(language: string): Country[] {
  const pinned = PINNED.map((iso) => COUNTRIES.find((item) => item.iso === iso)).filter(
    (item): item is Country => Boolean(item),
  );
  const rest = COUNTRIES.filter((item) => !PINNED.includes(item.iso)).sort((a, b) =>
    countryName(a.iso, language).localeCompare(countryName(b.iso, language), language),
  );
  return [...pinned, ...rest];
}

export function CountryPicker({ value, onChange, language, disabled }: CountryPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = findCountry(value);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
    };
  }, [open]);

  const countries = useMemo(() => orderedCountries(language), [language]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return countries;
    }
    return countries.filter((country) => {
      const name = countryName(country.iso, language).toLowerCase();
      return (
        name.includes(needle) ||
        country.iso.toLowerCase().includes(needle) ||
        country.dial.includes(needle)
      );
    });
  }, [countries, language, query]);

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  return (
    <div className="tg-country" ref={rootRef}>
      <button
        type="button"
        className="tg-country-button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("login.country")}
      >
        <span className="tg-country-flag" aria-hidden="true">
          {flagEmoji(selected.iso)}
        </span>
        <span className="tg-country-dial">{selected.dial}</span>
        <IconChevronDown size={14} stroke={2} className="tg-country-chevron" />
      </button>

      {open ? (
        <div className="tg-country-popover" role="dialog" aria-label={t("login.country")}>
          <label className="tg-country-search">
            <IconSearch size={15} stroke={1.8} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("login.countrySearch")}
              spellCheck={false}
              aria-label={t("login.countrySearch")}
            />
          </label>
          <div className="tg-country-list" role="listbox">
            {filtered.length === 0 ? (
              <p className="tg-country-empty">{t("login.countryEmpty")}</p>
            ) : (
              filtered.map((country) => (
                <button
                  type="button"
                  key={country.iso}
                  role="option"
                  aria-selected={country.iso === selected.iso}
                  className="tg-country-option"
                  data-selected={country.iso === selected.iso || undefined}
                  onClick={() => pick(country.iso)}
                >
                  <span className="tg-country-flag" aria-hidden="true">
                    {flagEmoji(country.iso)}
                  </span>
                  <span className="tg-country-name">{countryName(country.iso, language)}</span>
                  <span className="tg-country-option-dial">{country.dial}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
