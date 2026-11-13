import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import {
  COUNTRIES,
  countryName,
  findCountry,
  flagEmoji,
  type Country,
} from "../../data/countries";
import { Icon, TextField } from "../../ui";

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = findCountry(value);

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
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
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <button
          ref={triggerRef}
          type="button"
          className="f-country-trigger"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t("login.country")}
          data-country-trigger
        >
          <span className="f-country-flag" aria-hidden="true">
            {selected ? flagEmoji(selected.iso) : <Icon name="public" size={16} />}
          </span>
          {selected ? (
            <span className="f-country-dial">{selected.dial}</span>
          ) : (
            <span className="f-country-placeholder">{t("login.countrySelect")}</span>
          )}
          <Icon name="expand_more" size={14} />
        </button>
      </Popover.Trigger>
      <Popover.Content
        className="f-country-popover"
        side="top"
        align="start"
        sideOffset={8}
        width="336px"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <TextField
          size="2"
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder={t("login.countrySearch")}
          aria-label={t("login.countrySearch")}
          leadingIcon="search"
        />
        <div className="f-country-list" role="listbox" aria-label={t("login.country")}>
          {filtered.length === 0 ? (
            <p className="f-country-empty">{t("login.countryEmpty")}</p>
          ) : (
            filtered.map((country) => (
              <button
                type="button"
                key={country.iso}
                role="option"
                aria-selected={country.iso === selected?.iso}
                className="f-country-option"
                data-selected={country.iso === selected?.iso || undefined}
                onClick={() => pick(country.iso)}
              >
                <span className="f-country-flag" aria-hidden="true">
                  {flagEmoji(country.iso)}
                </span>
                <span className="f-country-name">{countryName(country.iso, language)}</span>
                <span className="f-country-option-dial">{country.dial}</span>
                {country.iso === selected?.iso ? <Icon name="check" size={15} /> : null}
              </button>
            ))
          )}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
