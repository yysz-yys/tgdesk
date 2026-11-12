import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  COUNTRIES,
  countryName,
  findCountry,
  flagEmoji,
  type Country,
} from "../../data/countries";
import { Icon } from "../ui/Icon";
import { SearchField } from "../ui/SearchField";

interface CountryPickerProps {
  value: string;
  onChange: (iso: string) => void;
  language: string;
  disabled?: boolean;
}

const PINNED = ["CN", "US", "GB", "JP", "KR", "RU", "IN", "DE", "FR", "SG"];
const POPOVER_WIDTH = 350;
const POPOVER_HEIGHT = 290;

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
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = findCountry(value);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPosition(null);
      return;
    }

    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const width = Math.min(POPOVER_WIDTH, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, rect.left),
        Math.max(12, window.innerWidth - width - 12),
      );
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow >= POPOVER_HEIGHT || rect.top < POPOVER_HEIGHT
          ? Math.min(rect.bottom + 8, window.innerHeight - 16)
          : Math.max(12, rect.top - POPOVER_HEIGHT - 8);
      setPosition({ top, left });
    };

    place();
    window.addEventListener("resize", place);

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
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
      const englishName = countryName(country.iso, "en").toLowerCase();
      return (
        name.includes(needle) ||
        englishName.includes(needle) ||
        country.iso.toLowerCase().includes(needle) ||
        country.dial.includes(needle)
      );
    });
  }, [countries, language, query]);

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="g-country" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="g-country-trigger"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("login.country")}
      >
        <span className="g-country-flag" aria-hidden="true">
          {flagEmoji(selected.iso)}
        </span>
        <span className="g-country-dial">{selected.dial}</span>
        <Icon name="expand_more" size={17} />
      </button>

      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              className="g-country-popover"
              role="dialog"
              aria-label={t("login.country")}
              style={
                {
                  top: position.top,
                  left: position.left,
                  width: `min(${POPOVER_WIDTH}px, calc(100vw - 24px))`,
                } as CSSProperties
              }
            >
              <SearchField
                compact
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder={t("login.countrySearch")}
                label={t("login.countrySearch")}
                clearLabel={t("common.clear")}
                className="g-country-search"
              />
              <div className="g-country-list" role="listbox">
                {filtered.length === 0 ? (
                  <p className="g-country-empty">{t("login.countryEmpty")}</p>
                ) : (
                  filtered.map((country) => (
                    <button
                      type="button"
                      key={country.iso}
                      role="option"
                      aria-selected={country.iso === selected.iso}
                      className="g-country-option"
                      data-selected={country.iso === selected.iso || undefined}
                      onClick={() => pick(country.iso)}
                    >
                      <span className="g-country-flag" aria-hidden="true">
                        {flagEmoji(country.iso)}
                      </span>
                      <span className="g-country-name">{countryName(country.iso, language)}</span>
                      <span className="g-country-option-dial">{country.dial}</span>
                      {country.iso === selected.iso ? (
                        <Icon name="check" size={17} className="g-country-check" />
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
