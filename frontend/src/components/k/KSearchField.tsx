import { useTranslation } from "react-i18next";
import { KIcon } from "./KIcon";
import { useRipple } from "./useRipple";

interface KSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  placeholder: string;
}

/**
 * Web K sidebar search: the old-style 44px pill (`InputSearch` with
 * `old-style`), a 24px magnifier, and a clear button that appears once text is
 * typed. On focus the pill turns transparent with an accent border.
 */
export function KSearchField({ value, onChange, onFocus, placeholder }: KSearchFieldProps) {
  const { t } = useTranslation();
  const clearRipple = useRipple<HTMLButtonElement>();
  const isEmpty = value.length === 0;

  return (
    <div className="input-search old-style">
      <input
        className={
          isEmpty
            ? "input-search-input is-empty"
            : "input-search-input is-not-empty"
        }
        type="text"
        value={value}
        placeholder=" "
        aria-label={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
      />
      <KIcon name="search" className="input-search-part input-search-icon" />
      {isEmpty ? (
        <span className="input-search-placeholder" aria-hidden="true">
          {placeholder}
        </span>
      ) : (
        <button
          ref={clearRipple.ref}
          type="button"
          className="btn-icon input-search-part input-search-button input-search-clear"
          aria-label={t("sidebar.clearSearch")}
          onClick={() => onChange("")}
        >
          <KIcon name="close" className="button-icon" />
        </button>
      )}
    </div>
  );
}
